const SAMPLE_INTERVAL_MS = 100;
const DRIFT_TOLERANCE_SECONDS = 0.04;
const HARD_SYNC_SECONDS = 0.5;
const HARD_SYNC_COOLDOWN_MS = 1500;
const MAX_VIDEO_RATE_ADJUSTMENT = 0.04;

function normalizeSources(value) {
  const list = Array.isArray(value) ? value : value?.sources?.length ? value.sources : [value];
  return list.map((source) => typeof source === "string" ? { url: source } : source)
    .filter((source) => source?.url);
}

function setSources(media, sources) {
  media.querySelectorAll(":scope > source").forEach((source) => source.remove());
  media.removeAttribute("src");
  for (const source of normalizeSources(sources)) {
    const element = document.createElement("source");
    element.src = source.url;
    if (source.mimeType) element.type = source.mimeType;
    media.appendChild(element);
  }
  media.load();
}

// Video owns user commands and seeks; the uninterrupted audio clock owns drift correction.
// One controller owns both elements, including every asynchronous play request.
export function createSyncPlayback({
  video, audio, videoSources, audioSources, initialTime = 0, playbackRate = 1,
  onDrift = () => {}, onPlayError = () => {}, onPlaybackIntent = () => {},
}) {
  if (!video || !audio) return null;
  video.__syncPlaybackCleanup?.();
  audio.__syncPlaybackCleanup?.();
  video.pause();
  audio.pause();

  let disposed = false;
  let wantsPlay = false;
  let baseRate = playbackRate;
  let timer = null;
  let generation = 0;
  let userSeeking = false;
  let internalVideoSeek = null;
  let audioSeekTarget = null;
  let lastHardSync = -Infinity;
  let largeDriftSince = null;
  const listeners = [];
  const internalPauses = new Map();
  const heldMedia = new Set();
  const pendingPlay = new Map();
  const initialPositions = new Map(initialTime > 0 ? [[video, initialTime], [audio, initialTime]] : []);
  const mediaElements = [video, audio];

  function listen(media, event, handler) {
    media.addEventListener(event, handler);
    listeners.push(() => media.removeEventListener(event, handler));
  }

  function resetRates() {
    video.playbackRate = baseRate;
    audio.playbackRate = baseRate;
    largeDriftSince = null;
  }

  function hold(media) {
    pendingPlay.delete(media);
    if (media.paused) return;
    // pause events are queued by browsers; a synchronous reentrancy flag is insufficient.
    heldMedia.add(media);
    internalPauses.set(media, (internalPauses.get(media) || 0) + 1);
    media.pause();
  }

  function pause() {
    if (wantsPlay) onPlaybackIntent(false);
    wantsPlay = false;
    generation++;
    clearTimeout(timer);
    timer = null;
    for (const media of mediaElements) hold(media);
    resetRates();
  }

  function fail(error, media, requestGeneration, request) {
    if (disposed || requestGeneration !== generation || pendingPlay.get(media) !== request) return;
    pendingPlay.delete(media);
    // A seek or a coordinated buffer hold can interrupt play without invalidating the source.
    if (error?.name === "AbortError") return;
    pause();
    onPlayError(error, media);
  }

  function start(media) {
    if (disposed || !wantsPlay || !media.paused || media.ended || pendingPlay.has(media)) return;
    heldMedia.delete(media);
    const requestGeneration = generation;
    const request = {};
    pendingPlay.set(media, request);
    try {
      Promise.resolve(media.play()).then(() => {
        if (pendingPlay.get(media) === request) pendingPlay.delete(media);
      }, (error) => fail(error, media, requestGeneration, request));
    } catch (error) {
      fail(error, media, requestGeneration, request);
    }
  }

  function seek(media, time) {
    if (media.readyState < 1 || !Number.isFinite(time)) return false;
    const target = Math.max(0, Number.isFinite(media.duration) ? Math.min(time, media.duration) : time);
    if (Math.abs(media.currentTime - target) <= 0.01) return true;
    try {
      if (media === video) internalVideoSeek = target;
      media.currentTime = target;
      return true;
    } catch {
      if (media === video) internalVideoSeek = null;
      return false;
    }
  }

  function restorePositions() {
    for (const [media, time] of initialPositions) {
      if (seek(media, time)) initialPositions.delete(media);
    }
    if (audioSeekTarget !== null && seek(audio, audioSeekTarget)) audioSeekTarget = null;
  }

  function ready(media) {
    return media.readyState >= 3 && !media.seeking && !media.error;
  }

  function observeUserPause() {
    // pause() changes .paused immediately; its event can arrive after a timeupdate/timer.
    if (wantsPlay && mediaElements.some((media) => media.paused && !media.ended &&
      !heldMedia.has(media) && !pendingPlay.has(media))) {
      pause();
      return true;
    }
    return false;
  }

  function resume() {
    if (disposed || !wantsPlay || observeUserPause()) return;
    restorePositions();
    if (userSeeking || initialPositions.size || audioSeekTarget !== null) return;
    if (!mediaElements.every(ready)) return;
    // Invoke both play methods in the same task, without awaiting the first promise.
    start(video);
    start(audio);
  }

  function schedule() {
    if (timer !== null || disposed || !wantsPlay) return;
    // Timers also run when requestAnimationFrame is suspended (background/PiP).
    timer = setTimeout(() => {
      timer = null;
      sample();
      schedule();
    }, SAMPLE_INTERVAL_MS);
  }

  function play() {
    if (disposed) return;
    if (!wantsPlay) {
      wantsPlay = true;
      onPlaybackIntent(true);
      generation++;
      resetRates();
      if (!initialPositions.size) audioSeekTarget = video.currentTime;
    }
    restorePositions();
    // Keep user activation for both media, even if metadata has not arrived yet.
    start(video);
    start(audio);
    schedule();
  }

  function sample() {
    if (disposed || !wantsPlay || observeUserPause()) return;
    restorePositions();
    if (userSeeking || initialPositions.size || audioSeekTarget !== null || !mediaElements.every(ready)) {
      resetRates();
      // Leave the starved element waiting; hold its peer so neither clock runs ahead.
      if (!ready(video) || userSeeking) hold(audio);
      if (!ready(audio)) hold(video);
      return;
    }
    resume();
    if (video.paused || audio.paused || audio.ended) return;
    const diff = video.currentTime - audio.currentTime;
    if (!Number.isFinite(diff)) return;
    onDrift(diff);
    const now = performance.now();
    if (Math.abs(diff) >= HARD_SYNC_SECONDS) {
      largeDriftSince ??= now;
      if (now - largeDriftSince >= 300 && now - lastHardSync >= HARD_SYNC_COOLDOWN_MS) {
        // Correct the silent video, preserving the audio timeline and pitch.
        seek(video, audio.currentTime);
        lastHardSync = now;
        resetRates();
        return;
      }
    } else {
      largeDriftSince = null;
    }
    const adjustment = Math.abs(diff) <= DRIFT_TOLERANCE_SECONDS ? 0
      : Math.max(-MAX_VIDEO_RATE_ADJUSTMENT, Math.min(MAX_VIDEO_RATE_ADJUSTMENT, diff * 0.25));
    video.playbackRate = baseRate * (1 - adjustment);
    audio.playbackRate = baseRate;
  }

  listen(video, "play", () => {
    if (!video.paused) {
      heldMedia.delete(video);
      play();
    }
  });
  for (const media of mediaElements) {
    listen(media, "pause", () => {
      const count = internalPauses.get(media) || 0;
      if (count) {
        internalPauses.set(media, count - 1);
        return;
      }
      if (media === audio && audio.ended && !video.ended) return;
      if (media.paused) pause();
    });
    listen(media, "waiting", () => {
      if (!wantsPlay || ready(media)) return;
      resetRates();
      hold(media === video ? audio : video);
    });
    for (const event of ["loadedmetadata", "canplay", "playing", "progress", "seeked"]) {
      listen(media, event, () => {
        if (disposed) return;
        restorePositions();
        resume();
      });
    }
    listen(media, "timeupdate", sample);
    listen(media, "error", pause);
  }
  listen(video, "seeking", () => {
    if (internalVideoSeek !== null && Math.abs(video.currentTime - internalVideoSeek) < 0.05) return;
    internalVideoSeek = null;
    initialPositions.clear();
    userSeeking = true;
    audioSeekTarget = video.currentTime;
    hold(audio);
    resetRates();
    restorePositions();
  });
  listen(video, "seeked", () => {
    internalVideoSeek = null;
    if (userSeeking) {
      audioSeekTarget = video.currentTime;
      userSeeking = false;
    }
    restorePositions();
    resume();
  });
  listen(video, "volumechange", () => {
    audio.volume = video.volume;
    audio.muted = video.muted;
  });
  listen(video, "ended", pause);


  function dispose() {
    if (disposed) return;
    disposed = true;
    listeners.forEach((remove) => remove());
    pause();
    for (const media of mediaElements) {
      if (media.__syncPlaybackCleanup === dispose) delete media.__syncPlaybackCleanup;
    }
  }

  video.__syncPlaybackCleanup = dispose;
  audio.__syncPlaybackCleanup = dispose;
  // Only the video controls autoplay, looping, volume and the visible playback state.
  audio.autoplay = false;
  audio.loop = false;
  audio.volume = video.volume;
  audio.muted = video.muted;
  resetRates();
  onDrift(0);
  setSources(video, videoSources);
  setSources(audio, normalizeSources(audioSources).slice(0, 1));
  return {
    play, pause, dispose,
    get wantsPlay() { return wantsPlay; },
    setPlaybackRate(rate) { baseRate = rate; resetRates(); },
  };
}
