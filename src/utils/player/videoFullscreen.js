// Only a click on the playback settings button authorizes fullscreen.
export function createVideoFullscreen(video, doc = document) {
  let requested = false;
  let disposed = false;
  const active = () => doc.fullscreenElement === video ||
    doc.webkitFullscreenElement === video || video.webkitDisplayingFullscreen ||
    video.webkitPresentationMode === 'fullscreen';
  const supported = Boolean(video.requestFullscreen || video.webkitRequestFullscreen ||
    video.webkitEnterFullscreen);

  async function exit() {
    try {
      if (doc.fullscreenElement === video) await doc.exitFullscreen();
      else if (doc.webkitFullscreenElement === video) await doc.webkitExitFullscreen();
      else if (video.webkitExitFullscreen) video.webkitExitFullscreen();
      else if (video.webkitSetPresentationMode) video.webkitSetPresentationMode('inline');
    } catch (error) {
      console.warn('Could not exit video fullscreen:', error);
    }
  }

  function onChange() {
    if (active()) {
      if (!requested) void exit();
    } else {
      requested = false;
    }
  }
  function onNativeBegin() {
    if (!requested) void exit();
  }
  function onNativeEnd() { requested = false; }

  const listeners = [
    [doc, 'fullscreenchange', onChange],
    [doc, 'webkitfullscreenchange', onChange],
    [video, 'webkitpresentationmodechanged', onChange],
    [video, 'webkitbeginfullscreen', onNativeBegin],
    [video, 'webkitendfullscreen', onNativeEnd],
  ];
  listeners.forEach(([target, name, handler]) => target.addEventListener(name, handler));

  return {
    supported,
    async enter() {
      if (disposed || !supported) return false;
      requested = true;
      try {
        if (video.requestFullscreen) await video.requestFullscreen();
        else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
        else await video.webkitRequestFullscreen();
        return true;
      } catch (error) {
        requested = false;
        console.warn('Could not enter video fullscreen:', error);
        return false;
      }
    },
    dispose() {
      disposed = true;
      requested = false;
      if (active()) void exit();
      listeners.forEach(([target, name, handler]) => target.removeEventListener(name, handler));
    },
  };
}
