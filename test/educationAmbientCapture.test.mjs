import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startEducationAmbientCapture,
  supportsEducationAmbientCapture,
} from '../src/utils/player/educationAmbientCapture.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture({ selection, crop, target, play, surface = 'browser' } = {}) {
  const events = [];
  const requests = [];
  const element = { isConnected: true };
  const cropTarget = {};
  let stoppedTracks = 0;
  let pauses = 0;
  let creates = 0;
  let onEndedCalls = 0;
  const track = Object.assign(new EventTarget(), {
    readyState: 'live',
    getSettings: () => ({ displaySurface: surface }),
    cropTo(value) {
      assert.equal(value, cropTarget);
      events.push('crop');
      return crop?.promise ?? Promise.resolve();
    },
    stop() { stoppedTracks++; this.readyState = 'ended'; },
  });
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  let srcObject = null;
  const video = Object.assign(new EventTarget(), {
    play() { events.push('play'); return play?.promise ?? Promise.resolve(); },
    pause() { pauses++; },
  });
  Object.defineProperty(video, 'srcObject', {
    get: () => srcObject,
    set(value) { events.push(value ? 'attach' : 'detach'); srcObject = value; },
  });
  const options = {
    navigator: { mediaDevices: { getDisplayMedia(value) {
      events.push('select');
      requests.push(value);
      return selection?.promise ?? Promise.resolve(stream);
    } } },
    window: { isSecureContext: true, CropTarget: { fromElement(value) {
      assert.equal(value, element);
      events.push('target');
      return target?.promise ?? Promise.resolve(cropTarget);
    } } },
    document: { createElement(tag) {
      assert.equal(tag, 'video');
      creates++;
      events.push('create');
      return video;
    } },
    onEnded() { onEndedCalls++; },
  };
  return {
    element, cropTarget, options, track, stream, video, events, requests,
    stoppedTracks: () => stoppedTracks, pauses: () => pauses,
    creates: () => creates, ended: () => onEndedCalls,
  };
}

test('opens the chooser synchronously and never attaches frames until cropping completes', async () => {
  const crop = deferred();
  const f = fixture({ crop });
  const pending = startEducationAmbientCapture(f.element, f.options);
  assert.deepEqual(f.events, ['select'], 'the click activation reaches getDisplayMedia immediately');
  assert.equal(f.requests[0].audio, false);
  assert.equal(f.requests[0].preferCurrentTab, true);
  assert.equal(f.requests[0].selfBrowserSurface, 'include');
  assert.equal(f.requests[0].surfaceSwitching, 'exclude');
  assert.deepEqual(f.requests[0].video, { displaySurface: 'browser', frameRate: { max: 15 } });
  await flush();
  assert.deepEqual(f.events, ['select', 'target', 'crop']);
  assert.equal(f.creates(), 0);
  crop.resolve();
  const session = await pending;
  assert.equal(session.video, f.video);
  assert.equal(f.video.srcObject, f.stream);
  assert.equal(f.video.muted, true);
  assert.equal(f.video.playsInline, true);
  assert.equal(f.video.disablePictureInPicture, true);
  assert.deepEqual(f.events, ['select', 'target', 'crop', 'create', 'attach', 'play']);
  session.stop();
  session.stop();
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(f.pauses(), 1);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.ended(), 0);
});

test('unsupported environments and disconnected players do not prompt for sharing', async () => {
  const f = fixture();
  f.options.window.isSecureContext = false;
  assert.equal(supportsEducationAmbientCapture(f.options), false);
  await assert.rejects(startEducationAmbientCapture(f.element, f.options), { code: 'EDUCATION_CAPTURE_UNSUPPORTED' });
  assert.equal(f.requests.length, 0);
  f.options.window.isSecureContext = true;
  f.element.isConnected = false;
  await assert.rejects(startEducationAmbientCapture(f.element, f.options), { code: 'EDUCATION_CAPTURE_CURRENT_TAB' });
  assert.equal(f.requests.length, 0);
});

test('chooser cancellation retains its native error without starting a video', async () => {
  const selection = deferred();
  const f = fixture({ selection });
  const denied = new DOMException('Cancelled', 'NotAllowedError');
  const pending = startEducationAmbientCapture(f.element, f.options);
  const rejected = assert.rejects(pending, error => error === denied);
  selection.reject(denied);
  await rejected;
  assert.equal(f.creates(), 0);
  assert.equal(f.ended(), 0);
});

test('window sharing, uncroppable tracks, and wrong-tab crop failures stop tracks without reading frames', async () => {
  for (const variant of ['window', 'uncroppable', 'wrong-tab']) {
    const crop = deferred();
    const f = fixture({ surface: variant === 'window' ? 'window' : 'browser', crop });
    if (variant === 'uncroppable') delete f.track.cropTo;
    const pending = startEducationAmbientCapture(f.element, f.options);
    const rejected = assert.rejects(pending, { code: 'EDUCATION_CAPTURE_CURRENT_TAB' });
    if (variant === 'wrong-tab') crop.reject(new DOMException('Different document', 'NotSupportedError'));
    await rejected;
    assert.equal(f.stoppedTracks(), 1, variant);
    assert.equal(f.creates(), 0, variant);
    assert.equal(f.video.srcObject, null, variant);
  }
});

test('aborting an outstanding chooser rejects promptly and stops a late-selected stream', async () => {
  const selection = deferred();
  const f = fixture({ selection });
  const controller = new AbortController();
  const pending = startEducationAmbientCapture(f.element, { ...f.options, signal: controller.signal });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejected;
  assert.equal(f.stoppedTracks(), 0);
  selection.resolve(f.stream);
  await flush();
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(f.creates(), 0);
  assert.equal(f.ended(), 0);
});

test('abort before activation never prompts, and abort after activation releases the entire session', async () => {
  const f = fixture();
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(startEducationAmbientCapture(f.element, {
    ...f.options, signal: cancelled.signal,
  }), { name: 'AbortError' });
  assert.equal(f.requests.length, 0);

  const active = new AbortController();
  let extraTrackStops = 0;
  f.stream.getTracks = () => [f.track, { stop() { extraTrackStops++; } }];
  const session = await startEducationAmbientCapture(f.element, { ...f.options, signal: active.signal });
  active.abort();
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(extraTrackStops, 1);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.pauses(), 1);
  session.stop();
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(extraTrackStops, 1);
  assert.equal(f.ended(), 0);
});

test('aborting a pending crop or play stops acquired tracks immediately and cannot reactivate later', async () => {
  for (const stage of ['target', 'crop', 'play']) {
    const gate = deferred();
    const f = fixture({ [stage]: gate });
    const controller = new AbortController();
    const pending = startEducationAmbientCapture(f.element, { ...f.options, signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await flush();
    assert.ok(f.events.includes(stage));
    assert.equal(f.stoppedTracks(), 0);
    controller.abort();
    assert.equal(f.stoppedTracks(), 1, stage);
    assert.equal(f.video.srcObject, null, stage);
    await rejected;
    gate.resolve(stage === 'target' ? f.cropTarget : undefined);
    await flush();
    assert.equal(f.stoppedTracks(), 1);
    assert.equal(f.video.srcObject, null);
    assert.equal(f.events.filter(event => event === 'attach').length, stage === 'play' ? 1 : 0);
  }
});

test('browser sharing stop and capture-video errors release the session and notify once', async () => {
  for (const source of ['track', 'video']) {
    const f = fixture();
    const session = await startEducationAmbientCapture(f.element, f.options);
    f[source].dispatchEvent(new Event(source === 'track' ? 'ended' : 'error'));
    assert.equal(f.stoppedTracks(), 1);
    assert.equal(f.video.srcObject, null);
    assert.equal(f.ended(), 1);
    f[source].dispatchEvent(new Event(source === 'track' ? 'ended' : 'error'));
    session.stop();
    assert.equal(f.stoppedTracks(), 1);
    assert.equal(f.ended(), 1);
  }
});

test('sharing stopped during cropping rejects promptly and never creates a capture video', async () => {
  const crop = deferred();
  const f = fixture({ crop });
  const pending = startEducationAmbientCapture(f.element, f.options);
  const rejected = assert.rejects(pending, { code: 'EDUCATION_CAPTURE_ENDED' });
  await flush();
  f.track.dispatchEvent(new Event('ended'));
  await rejected;
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(f.creates(), 0);
  crop.resolve();
  await flush();
  assert.equal(f.creates(), 0);
});

test('a failed video play clears the stream and does not leave sharing active', async () => {
  const play = deferred();
  const f = fixture({ play });
  const pending = startEducationAmbientCapture(f.element, f.options);
  const rejected = assert.rejects(pending, { code: 'EDUCATION_CAPTURE_VIDEO' });
  await flush();
  play.reject(new Error('Cannot decode'));
  await rejected;
  assert.equal(f.stoppedTracks(), 1);
  assert.equal(f.video.srcObject, null);
  assert.equal(f.pauses(), 1);
});
