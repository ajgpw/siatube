const AUTOPLAY_DELAY_MS = 3000;
const BUFFER_RESUME_SECONDS = 4;
const LOOP_BUFFER_SECONDS = 5;
const USER_GESTURE_KEY = "yt_user_gesture_v1";

function getBufferedAhead(element) {
  try {
    if (!element?.buffered) return 0;
    const currentTime = element.currentTime || 0;
    const buffered = element.buffered;
    for (let index = buffered.length - 1; index >= 0; index -= 1) {
      const start = buffered.start(index);
      const end = buffered.end(index);
      if (end > currentTime) {
        if (start <= currentTime) return end - currentTime;
        return end - currentTime;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export function createPlaybackController({
  videoRef,
  audioRef,
  settingsVisible,
  showUnmutePrompt,
  autoplayEnabled,
  repeatEnabled,
  isCurrentlyUsingM3u8,
  startM3u8LoadTimeout,
  clearM3u8LoadTimeout,
}) {
  let autoplayTimer = null;
  let buffering = false;
  let bufferElements = [];
  let loopResumeTimer = null;
  let loopBufferElements = [];
  let settingsHideTimer = null;

  function playMedia() {
    for (const media of [videoRef.value, audioRef.value]) {
      try { media?.play()?.catch(() => {}); } catch {}
    }
  }

  function showSettingsBox() {
    try {
      settingsVisible.value = true;
      clearTimeout(settingsHideTimer);
      settingsHideTimer = setTimeout(() => {
        settingsVisible.value = false;
      }, 3000);
    } catch {}
  }

  function checkAndResumeIfBuffered() {
    const videoAhead = getBufferedAhead(videoRef.value);
    const audioAhead = audioRef.value
      ? getBufferedAhead(audioRef.value)
      : videoAhead;
    if (
      buffering &&
      videoAhead >= BUFFER_RESUME_SECONDS &&
      audioAhead >= BUFFER_RESUME_SECONDS
    ) {
      buffering = false;
      playMedia();
      detachBufferListeners();
    }
  }

  function attachBufferListeners() {
    if (bufferElements.length) return;
    bufferElements = [videoRef.value, audioRef.value].filter(Boolean);
    try {
      if (videoRef.value) {
        videoRef.value.addEventListener("waiting", onWaiting);
        videoRef.value.addEventListener("progress", onProgress);
        videoRef.value.addEventListener("playing", onPlaying);
      }
      if (audioRef.value) {
        audioRef.value.addEventListener("waiting", onWaiting);
        audioRef.value.addEventListener("progress", onProgress);
        audioRef.value.addEventListener("playing", onPlaying);
      }
    } catch {}
  }

  function detachBufferListeners() {
    for (const media of bufferElements) {
      media.removeEventListener("waiting", onWaiting);
      media.removeEventListener("progress", onProgress);
      media.removeEventListener("playing", onPlaying);
    }
    bufferElements = [];
    buffering = false;
  }

  function onWaiting() {
    buffering = true;
    attachBufferListeners();
    if (isCurrentlyUsingM3u8()) startM3u8LoadTimeout();
  }

  function onProgress() {
    if (buffering) checkAndResumeIfBuffered();
  }

  function onPlaying() {
    buffering = false;
    clearM3u8LoadTimeout();
    detachBufferListeners();
  }

  function grantPlayback() {
    try { localStorage.setItem(USER_GESTURE_KEY, "1"); } catch {}
    showUnmutePrompt.value = false;
    try {
      if (videoRef.value) {
        videoRef.value.muted = false;
      }
      if (audioRef.value) {
        audioRef.value.muted = false;
      }
    } catch {}
    playMedia();
  }

  function scheduleAutoplay() {
    try {
      if (autoplayTimer) {
        clearTimeout(autoplayTimer);
        autoplayTimer = null;
      }
    } catch {}
    if (!autoplayEnabled.value) return;
    autoplayTimer = setTimeout(() => {
      playMedia();
      autoplayTimer = null;
    }, AUTOPLAY_DELAY_MS);
  }

  function cancelAutoplay() {
    try {
      if (autoplayTimer) {
        clearTimeout(autoplayTimer);
        autoplayTimer = null;
      }
    } catch {}
  }

  function onTimeUpdateLoopHandler() {
    try {
      if (!videoRef.value || !repeatEnabled.value) return;
      const currentTime = videoRef.value.currentTime || 0;
      if (currentTime <= 0.12 && videoRef.value.paused) startLoopResume();
    } catch {}
  }

  function startLoopResume() {
    try { cancelLoopResume(); } catch {}
    loopResumeTimer = setTimeout(() => {
      try { attemptResumeLoop(); } catch {}
    }, LOOP_BUFFER_SECONDS * 1000);
  }

  function cancelLoopResume() {
    try {
      if (loopResumeTimer) {
        clearTimeout(loopResumeTimer);
        loopResumeTimer = null;
      }
    } catch {}
    detachLoopBufferListeners();
  }

  function attemptResumeLoop() {
    const videoAhead = getBufferedAhead(videoRef.value);
    const audioAhead = audioRef.value
      ? getBufferedAhead(audioRef.value)
      : videoAhead;
    if (
      videoAhead >= LOOP_BUFFER_SECONDS &&
      audioAhead >= LOOP_BUFFER_SECONDS
    ) {
      playMedia();
      cancelLoopResume();
    } else {
      attachLoopBufferListeners();
    }
  }

  function attachLoopBufferListeners() {
    if (loopBufferElements.length) return;
    loopBufferElements = [videoRef.value, audioRef.value].filter(Boolean);
    try {
      if (videoRef.value) {
        videoRef.value.addEventListener("progress", onLoopBufferProgress);
        videoRef.value.addEventListener("playing", onLoopBufferProgress);
      }
      if (audioRef.value) {
        audioRef.value.addEventListener("progress", onLoopBufferProgress);
        audioRef.value.addEventListener("playing", onLoopBufferProgress);
      }
    } catch {}
  }

  function detachLoopBufferListeners() {
    for (const media of loopBufferElements) {
      media.removeEventListener("progress", onLoopBufferProgress);
      media.removeEventListener("playing", onLoopBufferProgress);
    }
    loopBufferElements = [];
  }

  function onLoopBufferProgress() {
    try {
      const videoAhead = getBufferedAhead(videoRef.value);
      const audioAhead = audioRef.value
        ? getBufferedAhead(audioRef.value)
        : videoAhead;
      if (
        videoAhead >= LOOP_BUFFER_SECONDS &&
        audioAhead >= LOOP_BUFFER_SECONDS
      ) {
        playMedia();
        cancelLoopResume();
      }
    } catch {}
  }

  function reset() {
    cancelAutoplay();
    cancelLoopResume();
    detachBufferListeners();
  }

  return {
    attachBufferListeners,
    cancelAutoplay,
    detachBufferListeners,
    detachLoopBufferListeners,
    reset,
    dispose() {
      reset();
      clearTimeout(settingsHideTimer);
      window.removeEventListener("click", grantPlayback);
      window.removeEventListener("touchstart", grantPlayback);
    },
    handleUnmuteClick: grantPlayback,
    onFirstUserGesture: grantPlayback,
    onTimeUpdateLoopHandler,
    scheduleAutoplay,
    showSettingsBox,
  };
}
