function captureError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function abortedError() {
  const error = captureError('EDUCATION_CAPTURE_ABORTED', '画面共有を中止しました。');
  error.name = 'AbortError';
  return error;
}

function stopTracks(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    try { track.stop(); } catch {}
  }
}

export function supportsEducationAmbientCapture({
  navigator: nav = globalThis.navigator,
  window: win = globalThis.window,
  document: doc = globalThis.document,
} = {}) {
  return Boolean(win?.isSecureContext !== false &&
    typeof nav?.mediaDevices?.getDisplayMedia === 'function' &&
    typeof win?.CropTarget?.fromElement === 'function' &&
    typeof doc?.createElement === 'function');
}

/** Capture only the current tab's player, after an explicit user gesture. */
export async function startEducationAmbientCapture(element, {
  signal,
  onEnded = () => {},
  navigator: nav = globalThis.navigator,
  window: win = globalThis.window,
  document: doc = globalThis.document,
} = {}) {
  if (signal?.aborted) throw abortedError();
  if (!supportsEducationAmbientCapture({ navigator: nav, window: win, document: doc })) {
    throw captureError('EDUCATION_CAPTURE_UNSUPPORTED',
      'この環境では再生画面の共有に対応していません。対応するPCブラウザとHTTPSが必要です。');
  }
  if (!element || element.isConnected === false) {
    throw captureError('EDUCATION_CAPTURE_CURRENT_TAB', '動画プレイヤーを表示してから共有してください。');
  }

  let stream = null;
  let video = null;
  let stopped = false;
  let stopReason = null;
  let rejectStopped;
  const listeners = [];
  const stoppedPromise = new Promise((_, reject) => { rejectStopped = reject; });

  function stop() {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', abort);
    for (const remove of listeners) remove();
    if (video) {
      try { video.pause(); } catch {}
      try { video.srcObject = null; } catch {}
    }
    stopTracks(stream);
    stream = null;
  }

  function terminate(error, notify = false) {
    if (stopped) return;
    stopReason = error;
    stop();
    rejectStopped(error);
    if (notify) {
      try { onEnded(error); } catch {}
    }
  }

  function abort() { terminate(abortedError()); }

  async function waitFor(operation) {
    const result = await Promise.race([operation, stoppedPromise]);
    if (stopped) throw stopReason ?? abortedError();
    return result;
  }

  function listen(target, type, listener) {
    target.addEventListener(type, listener);
    listeners.push(() => target.removeEventListener(type, listener));
  }

  signal?.addEventListener('abort', abort, { once: true });
  try {
    // Do not await anything before this call: the browser requires click activation.
    const selection = nav.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser', frameRate: { max: 15 } },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    });
    await waitFor(Promise.resolve(selection).then(selected => {
      if (stopped) {
        stopTracks(selected);
        throw stopReason ?? abortedError();
      }
      stream = selected;
    }));

    const track = stream.getVideoTracks()[0];
    if (!track || typeof track.cropTo !== 'function' ||
      track.getSettings?.().displaySurface !== 'browser') {
      throw captureError('EDUCATION_CAPTURE_CURRENT_TAB',
        '共有画面で、この動画を再生しているタブを選択してください。');
    }
    const ended = () => terminate(captureError('EDUCATION_CAPTURE_ENDED', '画面共有が終了しました。'), true);
    listen(track, 'ended', ended);
    if (track.readyState === 'ended') {
      ended();
      throw stopReason;
    }

    try {
      const target = await waitFor(win.CropTarget.fromElement(element));
      // Wrong tabs cannot be cropped to an element from this document. Never fall
      // back to an uncropped screen: it would also capture the ambient backdrop.
      await waitFor(track.cropTo(target));
    } catch (error) {
      if (stopReason) throw stopReason;
      throw captureError('EDUCATION_CAPTURE_CURRENT_TAB',
        '共有画面で、この動画を再生しているタブを選択してください。', error);
    }

    // No capture video is created or receives frames before cropping succeeds.
    video = doc.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    listen(video, 'error', () => terminate(captureError('EDUCATION_CAPTURE_VIDEO',
      '共有した映像を取得できませんでした。'), true));
    video.srcObject = stream;
    try {
      await waitFor(video.play());
    } catch (error) {
      if (stopReason) throw stopReason;
      throw captureError('EDUCATION_CAPTURE_VIDEO', '共有した映像を取得できませんでした。', error);
    }
    return { video, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
