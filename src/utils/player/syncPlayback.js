export function setupSyncPlayback(video, audio, sources, selectedQuality, diffText, selectedPlaybackRate, selectedVideoSources = null) {
  if (!video || !audio) return;
  video.__syncPlaybackCleanup?.();
  audio.__syncPlaybackCleanup?.();

  // Safari/WebKit判定（iOS系は全ブラウザでWebKitのためSafari扱い）
  function isSafariLike() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    if (isIOS) return true;
    const isMac = /Macintosh/.test(ua);
    if (!isMac) return false;
    return /Safari/.test(ua) && !/(Chrome|Chromium|Edg|OPR|Brave|Vivaldi)/.test(ua);
  }
  const safariMode = isSafariLike();

  function clearMediaSources(media) {
    if (!media) return;
    media.querySelectorAll(":scope > source").forEach((source) => source.remove());
    media.removeAttribute("src");
    media.load();
  }

  function setMediaSources(media, sourcesList) {
    if (!media) return;
    media.querySelectorAll(":scope > source").forEach((source) => source.remove());
    for (const sourceData of Array.isArray(sourcesList) ? sourcesList : []) {
      if (!sourceData?.url) continue;
      const source = document.createElement("source");
      source.src = sourceData.url;
      if (sourceData.mimeType) source.type = sourceData.mimeType;
      media.appendChild(source);
    }
    media.load();
  }

  function normalizeSources(value) {
    if (!value) return [];
    const list = Array.isArray(value.sources) && value.sources.length
      ? value.sources
      : [value];
    return list.map((source) => ({
      url: typeof source === "string" ? source : source?.url,
      mimeType: typeof source === "string" ? "" : source?.mimeType,
    })).filter((source) => source.url);
  }

  // 以前の同期ループを無効化（古いループを止める）
  const syncToken = (video.__syncPlaybackToken || 0) + 1;
  video.__syncPlaybackToken = syncToken;
  let disposed = false;
  let animationFrame = null;
  const timers = new Set();
  const canPlayListeners = new Set();
  const isActive = () => !disposed && video.__syncPlaybackToken === syncToken;
  const schedule = (callback, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (isActive()) callback();
    }, delay);
    timers.add(timer);
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    timers.forEach(clearTimeout);
    timers.clear();
    for (const listener of canPlayListeners) video.removeEventListener("canplay", listener);
    for (const media of [video, audio]) {
      for (const event of ["play", "pause", "seeking", "waiting", "playing"]) media[`on${event}`] = null;
      media.pause();
      if (media.__syncPlaybackCleanup === cleanup) delete media.__syncPlaybackCleanup;
    }
  };
  video.__syncPlaybackCleanup = cleanup;
  audio.__syncPlaybackCleanup = cleanup;

  let videoSrc, audioSrc;
  if (selectedQuality.value !== "muxed360p" && sources.value[selectedQuality.value]) {
    videoSrc = sources.value[selectedQuality.value].video;
    audioSrc = sources.value[selectedQuality.value].audio;
  } else if (sources.value.separateHigh) {
    videoSrc = sources.value.separateHigh.video;
    audioSrc = sources.value.separateHigh.audio;
  } else {
    return cleanup;
  }
  const targetVideoSources = selectedVideoSources ?? normalizeSources(videoSrc);
  const audioSources = normalizeSources(audioSrc).slice(0, 1);

  if (safariMode) {
    video.pause();
    audio.pause();
    clearMediaSources(video);
    clearMediaSources(audio);
    setMediaSources(video, targetVideoSources);
    setMediaSources(audio, audioSources);

    // 初期倍速反映
    video.playbackRate = selectedPlaybackRate.value;
    audio.playbackRate = selectedPlaybackRate.value;

    // イベント登録（上書き）
    video.onplay = () => {
      video.playbackRate = selectedPlaybackRate.value;
      audio.playbackRate = selectedPlaybackRate.value;
      if (audio.paused) audio.play().catch(() => {});
    };
    audio.onplay = () => {
      video.playbackRate = selectedPlaybackRate.value;
      audio.playbackRate = selectedPlaybackRate.value;
      if (video.paused) video.play().catch(() => {});
    };
    video.onpause = () => {
      if (!audio.paused) audio.pause();
    };
    audio.onpause = () => {
      if (!video.paused) video.pause();
    };
    video.onseeking = () => {
      audio.currentTime = video.currentTime;
    };

    // 再生再開時にも音声再生を保証
    video.onplaying = () => {
      if (audio.paused) audio.play().catch(() => {});
    };

    // --- Safari用：緩い同期補正 ---
    let lastJumpTime = 0;
    const jumpInterval = 1000; // ms
    function looseSync() {
      if (!isActive()) return;
      if (!video.paused) {
        // 音声が流れていない場合は再生
        if (audio.paused) {
          audio.play().catch(() => {});
        }
        const diff = video.currentTime - audio.currentTime;
        diffText.value = `${(diff * 1000).toFixed(0)} ms`;

        // ±0.5秒は何もしない
        if (Math.abs(diff) <= 0.5) {
          audio.playbackRate = selectedPlaybackRate.value;
          if (audio.paused) {
            audio.play().catch(() => {});
          }
        }
        // 1秒以上ズレたらジャンプ（1000msに1回だけ）
        else if (Math.abs(diff) >= 1) {
          const now = performance.now();
          if (now - lastJumpTime > jumpInterval) {
            audio.currentTime = video.currentTime;
            audio.playbackRate = selectedPlaybackRate.value;
            lastJumpTime = now;
          }
        }
        // 0.5秒～1秒の間は再生速度で補正
        else {
          // 最大±10%だけ補正
          const rateAdjust = 1 + Math.min(Math.abs(diff) / 1, 0.1) * (diff > 0 ? 1 : -1);
          audio.playbackRate = selectedPlaybackRate.value * rateAdjust;
        }
      }
      animationFrame = requestAnimationFrame(looseSync);
    }
    animationFrame = requestAnimationFrame(looseSync);

    return cleanup;
  }

  // --- ここから非 Safari 用の既存同期処理 ---
  // 画質変更時は必ず pause して src をクリア
  video.pause();
  audio.pause();
  clearMediaSources(video);
  clearMediaSources(audio);
  setMediaSources(video, targetVideoSources);
  setMediaSources(audio, audioSources);

  let isStartupJumpDone = false;
  let isBuffering = false;
  let isSyncingPlayback = false;
  let lastJumpTime = 0;
  const jumpCooldown = 500; // ms

  function jumpAudioToVideo() {
    const now = performance.now();
    if (now - lastJumpTime < jumpCooldown) return;
    const target = Math.max(0, video.currentTime - 0.05);
    audio.currentTime = target;
    lastJumpTime = now;
  }

  function correctPlaybackRate(diff) {
    const abs = Math.abs(diff);

    if (performance.now() - lastJumpTime < jumpCooldown) {
      audio.playbackRate = selectedPlaybackRate.value;
      return;
    }
    if (abs >= 0.9) {
      jumpAudioToVideo();
      return;
    }

    let maxAdjust;
    if (abs >= 0.8) {
      maxAdjust = 0.85;
    } else if (abs >= 0.1) {
      maxAdjust = 0.75;
    } else {
      maxAdjust = 0.015;
    }

    if (abs < 0.015) {
      audio.playbackRate = selectedPlaybackRate.value;
      return;
    }

    const adjustmentRatio = abs / 0.9;
    const rateAdjust = 1 + adjustmentRatio * maxAdjust * (diff > 0 ? 1 : -1);
    audio.playbackRate = selectedPlaybackRate.value * rateAdjust;
  }

  // 再生・停止イベント
  async function playBoth(withJump = false) {
    if (isSyncingPlayback) return;
    isSyncingPlayback = true;
    try {
      if (video.paused) await video.play();
      if (!isActive()) return;
      if (audio.paused) await audio.play();
      if (isActive() && withJump) jumpAudioToVideo();
    } catch (e) {
      // 再生失敗時は何もしない
    } finally {
      isSyncingPlayback = false;
    }
  }

  async function pauseBoth() {
    if (isSyncingPlayback) return;
    isSyncingPlayback = true;
    try {
      video.pause();
      audio.pause();
    } finally {
      isSyncingPlayback = false;
    }
  }

  audio.onplay = () => playBoth(true);
  video.onpause = () => pauseBoth();
  audio.onpause = () => pauseBoth();

  video.onwaiting = () => {
    isBuffering = true;
    if (!audio.paused) audio.pause();
  };

  video.onplaying = () => {
    if (isBuffering) {
      isBuffering = false;
      jumpAudioToVideo();
      if (video.paused) return;
      if (audio.paused && !isSyncingPlayback) {
        audio.play().catch(() => {});
      }
    }
  };

  // 再生開始
  video.onplay = () => {
    playBoth(true);
    video.playbackRate = selectedPlaybackRate.value;
    audio.playbackRate = selectedPlaybackRate.value; // 先に設定

    if (video.readyState >= 2) {
      if (audio.paused && !isSyncingPlayback) {
        // audio.play() の直後は playbackRate を変更しない
        audio.play().catch(() => {});
      }
    } else {
      const onCanPlay = () => {
        if (isActive() && audio.paused && !isSyncingPlayback) {
          audio.play().catch(() => {});
        }
        video.removeEventListener("canplay", onCanPlay);
        canPlayListeners.delete(onCanPlay);
      };
      canPlayListeners.add(onCanPlay);
      video.addEventListener("canplay", onCanPlay);
    }
    if (!isStartupJumpDone) {
      schedule(() => {
        jumpAudioToVideo();
        isStartupJumpDone = true;
      }, 100);
    }
  };

  video.onseeking = () => {
    schedule(() => jumpAudioToVideo(), 100);
  };

  function syncLoop() {
    if (!isActive()) return;
    if (!video.paused && !audio.paused) {
      const diff = video.currentTime - audio.currentTime;
      diffText.value = `${(diff * 1000).toFixed(0)} ms`;
      correctPlaybackRate(diff);
    }
    animationFrame = requestAnimationFrame(syncLoop);
  }
  animationFrame = requestAnimationFrame(syncLoop);

  // 初期倍速反映
  video.playbackRate = selectedPlaybackRate.value;
  audio.playbackRate = selectedPlaybackRate.value;
  return cleanup;
}
