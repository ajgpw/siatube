import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRenderer, nextTick, markRaw, reactive, ssrContextKey } from 'vue';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue()],
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: Controls } = await server.ssrLoadModule('/src/components/player/Type2PlayerControls.vue');
const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} });

class Media extends EventTarget {
  paused = true;
  ended = false;
  duration = 120;
  currentTime = 30;
  volume = 0.75;
  muted = false;
  buffered = { length: 1, start: () => 0, end: () => 60 };
}
async function mountControls(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100_000 });
  const originals = ['document', 'window'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const document = new EventTarget();
  const mediaQuery = Object.assign(new EventTarget(), { matches: false });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { matchMedia: () => mediaQuery } });
  const media = new Media();
  const props = reactive({ media, ...options });
  const events = [];
  const app = renderer.createApp({
    ...Controls, render: () => null,
  }, { ...props, onPlay: () => events.push('play'), onPause: () => events.push('pause') });
  app.provide(ssrContextKey, {});
  app.mount({});
  const state = app._instance.setupState;
  const target = markRaw({
    fullscreenRequests: 0,
    async requestFullscreen() {
      this.fullscreenRequests++;
      document.fullscreenElement = target;
      document.dispatchEvent(new Event('fullscreenchange'));
    },
  });
  document.exitFullscreen = async () => {
    document.fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
  state.root = { parentElement: target, contains: () => false, getBoundingClientRect: () => ({ left: 0, width: 640 }) };
  state.fullscreenSupported = true;
  await nextTick();
  t.after(() => {
    app.unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { state, media, document, target, events, instance: app._instance };
}
async function playing(media) { media.paused = false; media.dispatchEvent(new Event('play')); await nextTick(); }

test('controls hide after inactivity while paused or keyboard focused, and stay visible during settings or scrubbing', async (t) => {
  const { state, media } = await mountControls(t);
  t.mock.timers.tick(2999);
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(1);
  assert.equal(state.controlsShown, false);
  state.onFocusIn({ target: { matches: () => true } });
  assert.equal(state.controlsShown, true);
  await nextTick();
  t.mock.timers.tick(3000);
  assert.equal(state.controlsShown, false);
  await playing(media);
  t.mock.timers.tick(2999);
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(1);
  assert.equal(state.controlsShown, false);
  state.onPointerMove({ pointerType: 'mouse' });
  state.toggleSettings();
  await nextTick();
  t.mock.timers.tick(5000);
  assert.equal(state.controlsShown, true);
  state.closeSettings(false);
  state.beginScrub();
  await nextTick();
  t.mock.timers.tick(5000);
  assert.equal(state.controlsShown, true);
  state.cancelScrub();
  await nextTick();
  t.mock.timers.tick(3000);
  assert.equal(state.controlsShown, false);
  media.paused = true;
  media.dispatchEvent(new Event('pause'));
  await nextTick();
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(3000);
  assert.equal(state.controlsShown, false);
});

test('Space resumes and pauses playback without pinning controls, and further input restarts the timer', async (t) => {
  const { state, media, events } = await mountControls(t);
  const space = () => state.onKeydown({
    key: ' ', preventDefault() {},
    target: { matches: () => false, closest: () => null },
  });
  space();
  assert.deepEqual(events, ['play']);
  await playing(media);
  t.mock.timers.tick(2500);
  state.onPointerMove({ pointerType: 'mouse' });
  t.mock.timers.tick(2999);
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(1);
  assert.equal(state.controlsShown, false);
  space();
  assert.deepEqual(events, ['play', 'pause']);
  media.paused = true;
  media.dispatchEvent(new Event('pause'));
  await nextTick();
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(3000);
  assert.equal(state.controlsShown, false);
});

test('hiding focused controls transfers focus to the player for the next shortcut', async (t) => {
  const { state, document } = await mountControls(t);
  let focused = false;
  state.root = {
    contains: () => true,
    focus() { focused = true; },
  };
  document.activeElement = {};
  t.mock.timers.tick(3000);
  assert.equal(focused, true);
  assert.equal(state.controlsShown, false);
});

test('scrubbing previews without seeking, commits once, and clamps keyboard seeks to the media', async (t) => {
  const { state, media } = await mountControls(t);
  assert.equal(state.progressPercent, 25);
  assert.deepEqual(state.bufferedRanges, [{ left: 0, width: 50 }]);
  state.beginScrub();
  state.previewSeek({ target: { value: '90' } });
  assert.equal(state.displayTime, 90);
  assert.equal(media.currentTime, 30);
  state.commitSeek({ target: { value: '90' } });
  assert.equal(media.currentTime, 90);
  assert.equal(state.dragging, false);
  state.seekBy(100);
  assert.equal(media.currentTime, 120);
  state.seekBy(-200);
  assert.equal(media.currentTime, 0);
});

test('separate AV intent keeps the pause command during coordinated buffering', async (t) => {
  const { state, media, events } = await mountControls(t, { playbackIntent: true, buffering: true });
  assert.equal(media.paused, true);
  assert.equal(state.isPlaying, true);
  state.togglePlayback();
  assert.deepEqual(events, ['pause']);
});

test('fullscreen targets the player container so the custom overlay stays in fullscreen', async (t) => {
  const { state, document, target } = await mountControls(t);
  await state.toggleFullscreen();
  assert.equal(target.fullscreenRequests, 1);
  assert.equal(document.fullscreenElement, target);
  assert.equal(state.fullscreen, true);
  await state.toggleFullscreen();
  assert.equal(document.fullscreenElement, null);
  assert.equal(state.fullscreen, false);
});

test('shortcuts ignore form fields and native button activation without double toggling', async (t) => {
  const { state, events } = await mountControls(t);
  let prevented = 0;
  const key = (value, { field = false, button = false } = {}) => state.onKeydown({
    key: value, preventDefault() { prevented++; },
    target: { matches: () => field, closest: () => button },
  });
  key(' ', { field: true });
  key(' ', { button: true });
  assert.deepEqual(events, []);
  key('k');
  assert.deepEqual(events, ['play']);
  assert.equal(prevented, 1);
});

test('touch wakes controls and double taps seek without toggling playback or fullscreen', async (t) => {
  const { state, media, events, target } = await mountControls(t);
  await playing(media);
  t.mock.timers.tick(3000);
  assert.equal(state.controlsShown, false);
  state.onSurfaceTouch({ pointerType: 'touch', clientX: 600 });
  assert.equal(state.controlsShown, true);
  t.mock.timers.tick(100);
  state.onSurfaceTouch({ pointerType: 'touch', clientX: 600 });
  state.onSurfaceClick({ pointerType: 'touch' });
  state.onSurfaceDoubleClick({ pointerType: 'touch' });
  t.mock.timers.tick(500);
  assert.equal(media.currentTime, 40);
  assert.deepEqual(events, []);
  assert.equal(target.fullscreenRequests, 0);
});

test('live seek ranges and mute/volume commands use the active media element', async (t) => {
  const { state, media } = await mountControls(t);
  media.duration = Infinity;
  media.currentTime = 140;
  media.seekable = { length: 1, start: () => 100, end: () => 200 };
  media.dispatchEvent(new Event('durationchange'));
  assert.equal(state.timelineStart, 100);
  assert.equal(state.progressPercent, 40);
  state.seekBy(-1000);
  assert.equal(media.currentTime, 100);
  state.setVolume(0.3);
  assert.equal(media.volume, 0.3);
  state.toggleMute();
  assert.equal(media.muted, true);
  state.toggleMute();
  assert.equal(media.muted, false);
  assert.equal(media.volume, 0.3);
});

test('quality replacement preserves volume choices and releases the old media listeners', async (t) => {
  const { state, media, instance } = await mountControls(t);
  state.setVolume(0.4);
  state.toggleMute();
  const replacement = new Media();
  replacement.currentTime = 60;
  instance.props.media = replacement;
  await nextTick();
  assert.equal(replacement.volume, 0.4);
  assert.equal(replacement.muted, true);
  assert.equal(state.currentTime, 60);
  media.currentTime = 99;
  media.volume = 0.1;
  media.dispatchEvent(new Event('timeupdate'));
  media.dispatchEvent(new Event('volumechange'));
  assert.equal(state.currentTime, 60);
  assert.equal(state.volume, 0.4);
});
