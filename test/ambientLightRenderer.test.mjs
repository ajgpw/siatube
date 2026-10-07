import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbientLightRenderer } from '../src/utils/player/ambientLightRenderer.js';

class TrackedTarget extends EventTarget {
  listeners = new Map();

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    super.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

function fixture({ videoFrames = true, paused = false, readyState = 4, observer = true } = {}) {
  const video = Object.assign(new TrackedTarget(), {
    paused,
    ended: false,
    readyState,
    videoWidth: 1280,
    videoHeight: 720,
  });
  const doc = Object.assign(new TrackedTarget(), {
    hidden: false,
    visibilityState: 'visible',
    fullscreenElement: null,
    pictureInPictureElement: null,
  });
  let clock = 0;
  let nextId = 1;
  const videoCallbacks = new Map();
  const animationCallbacks = new Map();
  const cancelled = [];
  const calls = [];
  let resets = 0;
  let frames = 0;
  let drawFails = false;
  const context = {
    drawImage(...args) {
      if (drawFails) throw new Error('Frame unavailable');
      calls.push(args);
    },
    clearRect() {},
  };
  const canvas = { getContext: () => context };
  const win = {
    performance: { now: () => clock },
    requestAnimationFrame(callback) {
      const id = nextId++;
      animationCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelled.push(animationCallbacks.get(id));
      animationCallbacks.delete(id);
    },
  };
  if (videoFrames) {
    video.requestVideoFrameCallback = callback => {
      const id = nextId++;
      videoCallbacks.set(id, callback);
      return id;
    };
    video.cancelVideoFrameCallback = id => {
      cancelled.push(videoCallbacks.get(id));
      videoCallbacks.delete(id);
    };
  }
  const observers = [];
  if (observer) {
    win.IntersectionObserver = class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        observers.push(this);
      }

      observe(target) { this.target = target; }
      disconnect() { this.disconnected = true; }
      trigger(isIntersecting) {
        this.callback([{ target: this.target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0 }]);
      }
    };
  }
  const options = { document: doc, window: win, onFrame: () => frames++, onReset: () => resets++ };
  return {
    video, doc, win, canvas, context, options, calls, cancelled, observers,
    frames: () => frames,
    resets: () => resets,
    failDrawing(value) { drawFails = value; },
    pending: () => videoCallbacks.size + animationCallbacks.size,
    pendingVideo: () => videoCallbacks.size,
    pendingAnimation: () => animationCallbacks.size,
    event(type, target = video) { target.dispatchEvent(new Event(type)); },
    tick(time) {
      clock = time;
      for (const callbacks of [videoCallbacks, animationCallbacks]) {
        const batch = [...callbacks.values()];
        callbacks.clear();
        for (const callback of batch) callback(time);
      }
    },
  };
}

test('draws the video at low resolution and throttles video frame callbacks to 15 FPS', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  assert.equal(f.canvas.width, 96);
  assert.equal(f.canvas.height, 54);
  assert.deepEqual(f.calls[0], [f.video, 0, 0, 96, 54]);
  assert.equal(f.pendingVideo(), 1);
  assert.equal(f.pendingAnimation(), 0, 'video frame callbacks are preferred');
  for (const time of [16, 32, 48, 64]) f.tick(time);
  assert.equal(f.frames(), 1);
  f.tick(80);
  assert.equal(f.frames(), 2);
  f.tick(140);
  assert.equal(f.frames(), 2);
  f.tick(160);
  assert.equal(f.frames(), 3);
  assert.equal(f.pending(), 1);
  renderer.dispose();
});

test('animation frame fallback throttles and cancels cleanly without an intersection observer', () => {
  const f = fixture({ videoFrames: false, observer: false });
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  assert.equal(f.pendingAnimation(), 1);
  f.tick(30);
  assert.equal(f.frames(), 1);
  f.tick(70);
  assert.equal(f.frames(), 2);
  renderer.dispose();
  assert.equal(f.pending(), 0);
  assert.equal(f.video.listenerCount(), 0);
  assert.equal(f.doc.listenerCount(), 0);
});

test('pause draws the final frame once, seeks update paused frames, and playback resumes', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  f.video.paused = true;
  f.event('pause');
  assert.equal(f.frames(), 2);
  assert.equal(f.pending(), 0);
  f.cancelled[0](90);
  assert.equal(f.frames(), 2, 'a queued callback cannot draw after cancellation');
  f.event('seeking');
  f.event('seeked');
  assert.equal(f.frames(), 3);
  assert.equal(f.pending(), 0);
  f.video.paused = false;
  f.event('playing');
  assert.equal(f.pending(), 1);
  f.event('waiting');
  assert.equal(f.pending(), 0);
  f.tick(200);
  const bufferedFrames = f.frames();
  f.event('playing');
  assert.equal(f.frames(), bufferedFrames + 1);
  assert.equal(f.pending(), 1);
  f.video.ended = true;
  f.event('ended');
  assert.equal(f.pending(), 0);
  renderer.dispose();
});

test('hidden and offscreen videos stop rendering and redraw when visible, including while paused', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  f.doc.hidden = true;
  f.event('visibilitychange', f.doc);
  assert.equal(f.pending(), 0);
  assert.equal(f.resets(), 1);
  f.tick(100);
  assert.equal(f.frames(), 1);
  f.doc.hidden = false;
  f.event('visibilitychange', f.doc);
  assert.equal(f.frames(), 2);
  assert.equal(f.pending(), 1);
  f.observers[0].trigger(false);
  assert.equal(f.pending(), 0);
  f.video.paused = true;
  f.event('pause');
  assert.equal(f.frames(), 2);
  f.observers[0].trigger(true);
  assert.equal(f.frames(), 3);
  assert.equal(f.pending(), 0, 'returning to view redraws a paused frame without a loop');
  renderer.dispose();
  assert.equal(f.observers[0].disconnected, true);
});

test('picture in picture and native video fullscreen suspend the backdrop', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  for (const [enter, leave] of [
    ['enterpictureinpicture', 'leavepictureinpicture'],
    ['webkitbeginfullscreen', 'webkitendfullscreen'],
  ]) {
    f.event(enter);
    assert.equal(f.pending(), 0);
    f.event(leave);
    assert.equal(f.pending(), 1);
  }
  f.doc.fullscreenElement = f.video;
  f.event('fullscreenchange', f.doc);
  assert.equal(f.pending(), 0);
  f.doc.fullscreenElement = null;
  f.event('fullscreenchange', f.doc);
  assert.equal(f.pending(), 1);
  for (const mode of ['picture-in-picture', 'fullscreen']) {
    const framesBefore = f.frames();
    const resetsBefore = f.resets();
    f.video.webkitPresentationMode = mode;
    f.event('webkitpresentationmodechanged');
    assert.equal(f.pending(), 0, `Safari ${mode} stops the loop`);
    assert.equal(f.resets(), resetsBefore + 1, `Safari ${mode} clears the backdrop`);
    f.tick(200);
    assert.equal(f.frames(), framesBefore, `Safari ${mode} cannot render background frames`);
    f.video.webkitPresentationMode = 'inline';
    f.event('webkitpresentationmodechanged');
    assert.equal(f.pending(), 1, 'Safari inline presentation resumes the loop');
    assert.equal(f.frames(), framesBefore + 1, 'returning inline redraws the video');
  }
  renderer.dispose();
});

test('changing the source resets old pixels and waits for drawable data before restarting', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  f.video.readyState = 0;
  f.video.videoWidth = 0;
  f.event('emptied');
  assert.equal(f.pending(), 0);
  assert.equal(f.resets(), 1);
  f.cancelled[0](100);
  f.event('playing');
  assert.equal(f.frames(), 1);
  assert.equal(f.pending(), 0);
  f.video.readyState = 2;
  f.video.videoWidth = 1920;
  f.event('loadeddata');
  assert.equal(f.frames(), 2);
  assert.equal(f.pending(), 1);
  f.event('error');
  assert.equal(f.pending(), 0);
  f.event('playing');
  assert.equal(f.frames(), 2);
  f.event('loadeddata');
  assert.equal(f.frames(), 3);
  renderer.dispose();
});

test('a failed draw stops scheduling until loadeddata reinitializes the source', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  f.failDrawing(true);
  f.tick(80);
  assert.equal(f.pending(), 0);
  assert.equal(f.resets(), 1);
  f.failDrawing(false);
  f.event('playing');
  f.event('seeked');
  assert.equal(f.frames(), 1);
  assert.equal(f.pending(), 0);
  f.event('loadeddata');
  assert.equal(f.frames(), 2);
  assert.equal(f.pending(), 1);
  renderer.dispose();
});

test('dispose removes listeners and prevents a replaced video from drawing over the new video', () => {
  const first = fixture();
  const oldRenderer = createAmbientLightRenderer(first.video, first.canvas, first.options);
  oldRenderer.dispose();
  const oldResetCount = first.resets();
  oldRenderer.dispose();
  assert.equal(first.resets(), oldResetCount, 'disposal is idempotent');
  const second = fixture();
  const newRenderer = createAmbientLightRenderer(second.video, first.canvas, second.options);
  const drawsAfterReplacement = first.calls.length;
  first.cancelled[0](100);
  first.event('loadeddata');
  first.event('playing');
  first.event('visibilitychange', first.doc);
  first.observers[0].trigger(true);
  assert.equal(first.calls.length, drawsAfterReplacement);
  assert.equal(first.calls.at(-1)[0], second.video);
  assert.equal(first.pending(), 0);
  assert.equal(first.video.listenerCount(), 0);
  assert.equal(first.doc.listenerCount(), 0);
  assert.equal(first.observers[0].disconnected, true);
  newRenderer.dispose();
});

test('unloaded or dimensionless video does not start a loop', () => {
  const f = fixture({ readyState: 1 });
  const renderer = createAmbientLightRenderer(f.video, f.canvas, f.options);
  assert.equal(f.pending(), 0);
  assert.equal(f.frames(), 0);
  f.video.readyState = 2;
  f.video.videoHeight = 0;
  f.event('loadeddata');
  assert.equal(f.pending(), 0);
  assert.equal(f.frames(), 0);
  f.video.videoHeight = 720;
  f.event('resize');
  assert.equal(f.pending(), 1);
  assert.equal(f.frames(), 1);
  renderer.dispose();
});

test('unavailable canvas contexts safely leave media untouched', () => {
  const f = fixture();
  const renderer = createAmbientLightRenderer(f.video, { getContext: () => null }, f.options);
  assert.equal(f.video.listenerCount(), 0);
  assert.equal(f.pending(), 0);
  assert.equal(f.video.paused, false);
  renderer.dispose();
});
