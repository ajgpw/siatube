const FRAME_INTERVAL = 1000 / 15;
const CANVAS_WIDTH = 96;
const CANVAS_HEIGHT = 54;

/** Draw a small copy of the video for a CSS-blurred ambient light backdrop. */
export function createAmbientLightRenderer(video, canvas, {
  onFrame = () => {},
  onReset = () => {},
  document: doc = globalThis.document,
  window: win = globalThis.window,
} = {}) {
  let context;
  try {
    context = canvas?.getContext('2d');
  } catch {
    // An unavailable canvas must never interfere with video playback.
  }
  if (!video || !context) return { dispose() {} };

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  let disposed = false;
  let failed = false;
  let waiting = false;
  let intersecting = true;
  let pictureInPicture = false;
  let nativeFullscreen = Boolean(video.webkitDisplayingFullscreen);
  let lastDrawTime = -Infinity;
  let pending = null;
  let generation = 0;
  let observer;
  const listeners = [];
  const useVideoFrames = typeof video.requestVideoFrameCallback === 'function';
  const now = () => win?.performance?.now?.() ?? globalThis.performance?.now?.() ?? 0;

  function notify(callback) {
    try {
      callback();
    } catch {
      // Presentation callbacks must not affect the player's media event handlers.
    }
  }

  function suppressed() {
    return Boolean(
      doc?.hidden || doc?.visibilityState === 'hidden' || !intersecting ||
      pictureInPicture || doc?.pictureInPictureElement === video ||
      video.webkitPresentationMode === 'picture-in-picture' ||
      video.webkitPresentationMode === 'fullscreen' ||
      nativeFullscreen || video.webkitDisplayingFullscreen ||
      doc?.fullscreenElement === video || doc?.webkitFullscreenElement === video
    );
  }

  function drawable() {
    return !disposed && !failed && !suppressed() &&
      video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
  }

  function canLoop() {
    return drawable() && !waiting && !video.paused && !video.ended;
  }

  function cancelPending() {
    // Cancellation can race with a queued callback, including during source changes.
    generation++;
    if (!pending) return;
    const scheduled = pending;
    pending = null;
    try {
      if (scheduled.videoFrame) video.cancelVideoFrameCallback?.(scheduled.id);
      else win?.cancelAnimationFrame?.(scheduled.id);
    } catch {
      // The generation check still prevents an uncancellable callback from drawing.
    }
  }

  function reset() {
    try {
      context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } catch {
      // A lost drawing context is harmless to the actual video element.
    }
    notify(onReset);
  }

  function drawFrame(timestamp, force = false) {
    if (!drawable() || waiting) return;
    if (!force && timestamp - lastDrawTime < FRAME_INTERVAL) return;
    try {
      // Never inspect pixels or change crossOrigin: existing playback sources stay intact.
      context.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      lastDrawTime = timestamp;
    } catch {
      failed = true;
      cancelPending();
      reset();
      return;
    }
    notify(onFrame);
  }

  function schedule() {
    if (pending || !canLoop()) return;
    const scheduledGeneration = generation;
    const callback = timestamp => {
      if (disposed || scheduledGeneration !== generation) return;
      pending = null;
      if (!canLoop()) return;
      drawFrame(Number.isFinite(timestamp) ? timestamp : now());
      schedule();
    };
    try {
      if (useVideoFrames) {
        pending = { videoFrame: true, id: video.requestVideoFrameCallback(callback) };
      } else if (typeof win?.requestAnimationFrame === 'function') {
        pending = { videoFrame: false, id: win.requestAnimationFrame(callback) };
      }
    } catch {
      // Unsupported scheduling disables animation without changing playback.
    }
  }

  function refresh(drawStill = false) {
    if (disposed) return;
    if (suppressed()) {
      cancelPending();
      reset();
      return;
    }
    if (drawStill) drawFrame(now(), true);
    if (canLoop()) schedule();
    else cancelPending();
  }

  function listen(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  }

  function sourceStopped() {
    cancelPending();
    waiting = true;
    lastDrawTime = -Infinity;
    reset();
  }

  listen(video, 'loadeddata', () => {
    failed = false;
    waiting = false;
    lastDrawTime = -Infinity;
    refresh(true);
  });
  for (const event of ['playing', 'canplay']) {
    listen(video, event, () => {
      waiting = false;
      refresh(true);
    });
  }
  for (const event of ['pause', 'ended']) {
    listen(video, event, () => {
      cancelPending();
      drawFrame(now(), true);
    });
  }
  for (const event of ['waiting', 'seeking']) {
    listen(video, event, () => {
      waiting = true;
      cancelPending();
    });
  }
  listen(video, 'seeked', () => {
    if (video.readyState >= 2) waiting = false;
    refresh(true);
  });
  listen(video, 'resize', () => refresh(true));
  for (const event of ['loadstart', 'emptied']) listen(video, event, sourceStopped);
  listen(video, 'error', () => {
    failed = true;
    sourceStopped();
  });
  listen(video, 'enterpictureinpicture', () => {
    pictureInPicture = true;
    refresh();
  });
  listen(video, 'leavepictureinpicture', () => {
    pictureInPicture = false;
    refresh(true);
  });
  listen(video, 'webkitbeginfullscreen', () => {
    nativeFullscreen = true;
    refresh();
  });
  listen(video, 'webkitendfullscreen', () => {
    nativeFullscreen = false;
    refresh(true);
  });
  listen(video, 'webkitpresentationmodechanged', () => refresh(true));
  for (const event of ['visibilitychange', 'fullscreenchange', 'webkitfullscreenchange']) {
    listen(doc, event, () => refresh(true));
  }

  const Observer = win?.IntersectionObserver ?? globalThis.IntersectionObserver;
  if (typeof Observer === 'function') {
    try {
      observer = new Observer(entries => {
        if (disposed) return;
        for (const entry of entries) {
          if (entry.target !== video) continue;
          intersecting = entry.isIntersecting && entry.intersectionRatio !== 0;
          refresh(true);
        }
      });
      observer.observe(video);
    } catch {
      observer?.disconnect();
      observer = undefined;
    }
  }

  refresh(true);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      for (const remove of listeners) remove();
      observer?.disconnect();
      reset();
    },
  };
}
