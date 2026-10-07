import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRenderer, nextTick, ssrContextKey } from "vue";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

// Execute the component's real setup/watchers, replacing only network and status services.
const stubs = {
  "@/services/api/siatubeApi.js": `
    export const stream = (...args) => globalThis.type2TestFetch(...args);
    export const isVideoStreamError = () => false;
  `,
  "@/composables/useMediaSessionMetadata.js": `
    export const useMediaSessionMetadata = () => ({ updateMetadata() {} });
  `,
  "@/composables/useStreamServerStatus.js": `
    import { ref } from "vue";
    export const useStreamServerStatus = () => ({
      estimatedWaitText: ref(""), statusClock: ref(0),
      streamStatusDetail: ref(""), streamStatusTitle: ref(""),
    });
  `,
};
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [{
    name: "type2-test-services",
    enforce: "pre",
    resolveId(id) {
      const key = id.replace(fileURLToPath(new URL("../src/", import.meta.url)), "@/");
      if (stubs[key]) return `\0${key}`;
    },
    load(id) { return stubs[id.slice(1)]; },
  }, vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { default: StreamType2 } = await server.ssrLoadModule("/src/components/player/StreamType2.vue");
after(() => server.close());

class Media extends EventTarget {
  constructor() {
    super();
    this.duration = NaN;
    this.currentTime = 0;
    this.readyState = 0;
    this.networkState = 2;
    this.paused = true;
    this.loads = 0;
    this.plays = 0;
    this.children = [];
    this.playResult = () => Promise.resolve();
  }
  canPlayType(type) { return /mpegurl/i.test(type) ? "" : "probably"; }
  play() { this.plays++; return this.playResult(); }
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute() {}
  querySelectorAll(selector) { return selector.includes("source") ? this.children.slice() : []; }
  querySelector() { return this.children[0] || null; }
  appendChild(source) {
    source.parentElement = this;
    source.remove = () => { this.children = this.children.filter((item) => item !== source); };
    this.children.push(source);
  }
}

const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} });
async function flush() { await nextTick(); await Promise.resolve(); await nextTick(); }

async function mountPlayer(t, { apple = false } = {}) {
  const names = ["window", "document", "navigator", "localStorage", "type2TestFetch", "requestAnimationFrame", "cancelAnimationFrame"];
  const originals = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100_000 });
  const window = Object.assign(new EventTarget(), {
    setTimeout: (...args) => setTimeout(...args), clearTimeout: (id) => clearTimeout(id),
  });
  const document = Object.assign(new EventTarget(), {
    createElement: () => new Media(),
    querySelectorAll: () => [], cookie: "",
  });
  let resolveStream;
  const response = new Promise((resolve) => { resolveStream = resolve; });
  const values = new Map([["autoplayEnabled", "false"]]);
  let frameId = 0;
  const frames = new Map();
  const globals = {
    window, document,
    navigator: { userAgent: apple ? "iPhone Safari" : "Chrome", platform: apple ? "iPhone" : "Linux", language: "ja" },
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    type2TestFetch: () => response,
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  const emitted = [];
  const mediaElements = [];
  const app = renderer.createApp({ ...StreamType2, render: () => null }, {
    videoId: "abcdefghijk", onLoadingTimeoutReload: () => emitted.push("reload"),
    onVideoElement: (video) => mediaElements.push(video),
  });
  app.provide(ssrContextKey, {});
  app.mount({});
  const state = app._instance.setupState;
  state.autoplayEnabled = false;
  const video = new Media();
  const audio = new Media();
  state.videoRef = video;
  t.after(() => {
    app.unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  await flush();
  return { state, video, audio, emitted, mediaElements, resolveStream, frames, unmount: () => app.unmount() };
}

function setSources(state, separated = false) {
  state.sources = {
    "720p": separated
      ? { video: { url: "https://media.example/video.mp4" }, audio: { url: "https://media.example/audio.m4a" } }
      : { url: "https://media.example/video.mp4", sources: [
        { url: "https://media.example/video.mp4" }, { url: "https://media.example/alternate.mp4" },
      ] },
    "360p": { url: "https://media.example/low.mp4" },
  };
  state.availableQualities = ["720p", "360p"];
  state.selectedQuality = "720p";
}

test("ambient light receives each active video and releases it when playback has no video", async (t) => {
  const { state, video, mediaElements } = await mountPlayer(t);
  assert.deepEqual(mediaElements, [video]);
  const replacement = new Media();
  state.videoRef = replacement;
  await flush();
  assert.deepEqual(mediaElements, [video, replacement]);
  state.videoRef = null;
  await flush();
  assert.deepEqual(mediaElements, [video, replacement, null]);
});

test("the interaction blocker expires when Apple fallback replaces the same quality", async (t) => {
  const { state } = await mountPlayer(t, { apple: true });
  setSources(state, true);
  state.sources["720p"].video.sources = [{ url: "https://media.example/first.mp4" }, { url: "https://media.example/second.mp4" }];
  await flush();
  assert.equal(state.isQualitySwitching, true);
  t.mock.timers.tick(200);
  assert.equal(state.tryNextAppleSource(), true);
  await flush();
  t.mock.timers.tick(5_000);
  await flush();
  assert.equal(state.isQualitySwitching, false);
});

test("autoplay denial and an interrupted play do not reload or reject a stream", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  state.autoplayEnabled = true;
  const initialLoads = video.loads;
  for (const name of ["NotAllowedError", "AbortError"]) {
    video.playResult = () => Promise.reject(new DOMException("play blocked", name));
    state.checkPlayback();
    await flush();
  }
  assert.equal(video.loads, initialLoads);
  assert.equal(state.setupFailureCount, 0);
  assert.equal(state.selectedQuality, "720p");
});

test("canplay respects disabled autoplay", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  state.checkPlayback();
  await flush();
  assert.equal(video.plays, 0);
});

test("a play failure from a replaced element cannot reload the current stream", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  state.autoplayEnabled = true;
  let rejectPlay;
  video.playResult = () => new Promise((_, reject) => { rejectPlay = reject; });
  state.checkPlayback();
  const replacement = new Media();
  state.videoRef = replacement;
  await flush();
  rejectPlay(new DOMException("old source failed", "NotSupportedError"));
  await flush();
  assert.equal(replacement.loads, 0);
  assert.equal(state.setupFailureCount, 0);
});

test("metadata loading is not replaced after 1.5 seconds or remounted after six", async (t) => {
  const { state, video, emitted, resolveStream } = await mountPlayer(t);
  resolveStream({ streams: { muxed: [720, 360].map((height) => ({
    height, mediaType: "muxed", vcodec: "avc1.640028", acodec: "mp4a.40.2",
    streamUrl: `https://media.example/${height}.mp4`, ext: "mp4",
  })) } });
  await flush();
  assert.equal(state.selectedQuality, "720p");
  state.markPlayerBuffering({ currentTarget: video });
  t.mock.timers.tick(6_500);
  await flush();
  assert.equal(state.selectedQuality, "720p");
  assert.deepEqual(emitted, []);
});

test("readiness from old media or auxiliary audio cannot mark the current video ready", async (t) => {
  const { state, video, audio } = await mountPlayer(t);
  state.audioRef = audio;
  state.playerReady = false;
  state.markPlayerReady({ currentTarget: new Media() });
  assert.equal(state.playerReady, false);
  state.markPlayerPlaying({ currentTarget: audio });
  assert.equal(state.playbackEstablished, false);
  video.readyState = 2;
  state.markPlayerReady({ currentTarget: video });
  assert.equal(state.playerReady, true);
});

test("an HLS external playback link is not covered by a loading overlay", async (t) => {
  const { state } = await mountPlayer(t);
  state.sources = { "720p": { url: "https://media.example/master.m3u8", isM3u8: true } };
  state.hasM3u8 = true;
  state.availableQualities = ["720p"];
  state.selectedQuality = "720p";
  await flush();
  assert.equal(state.externalM3u8Url, "https://media.example/master.m3u8");
  assert.equal(state.type2LoadingOverlayVisible, false);
});

test("replacing separate AV binds the new pair and disposes the old synchronization", async (t) => {
  const { state, video, audio, frames, unmount } = await mountPlayer(t, { apple: true });
  state.audioRef = audio;
  setSources(state, true);
  state.sources["720p"].video.sources = [{ url: "https://media.example/first.mp4" }, { url: "https://media.example/second.mp4" }];
  await flush();
  assert.equal(frames.size, 1);
  assert.equal(typeof video.onplay, "function");
  const replacementVideo = new Media();
  const replacementAudio = new Media();
  state.videoRef = replacementVideo;
  state.audioRef = replacementAudio;
  state.tryNextAppleSource();
  await flush();
  assert.equal(video.onplay, null);
  assert.equal(audio.onplay, null);
  assert.equal(frames.size, 1);
  assert.equal(replacementVideo.children[0].src, "https://media.example/second.mp4");
  replacementVideo.onplay();
  assert.equal(replacementAudio.plays, 1);
  assert.equal(audio.plays, 0);
  unmount();
  assert.equal(frames.size, 0);
  assert.equal(replacementVideo.onplay, null);
});

test("an old unlock timer cannot unlock a newer switch, and readiness releases it immediately", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  t.mock.timers.tick(500);
  state.selectedQuality = "360p";
  await flush();
  t.mock.timers.tick(600);
  assert.equal(state.isQualitySwitching, true);
  video.readyState = 1;
  state.markPlayerReady({ currentTarget: video });
  assert.equal(state.isQualitySwitching, false);
});

test("real media errors try remaining qualities without cycling back to failed ones", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  video.error = { code: 4 };
  state.handleVideoError({ currentTarget: video });
  await flush();
  assert.equal(state.selectedQuality, "360p");
  assert.equal(state.error, "");
  state.handleVideoError({ currentTarget: video });
  await flush();
  assert.equal(state.selectedQuality, "360p");
  assert.match(state.error, /再取得/);
  assert.equal(state.isQualitySwitching, false);
});

test("continuing network progress extends startup preparation", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  t.mock.timers.tick(14_000);
  state.handleMediaProgress({ currentTarget: video });
  t.mock.timers.tick(5_000);
  await flush();
  assert.equal(state.selectedQuality, "720p");
});

test("deferred preload while paused is not treated as a failed stream", async (t) => {
  const { state, video } = await mountPlayer(t);
  setSources(state);
  await flush();
  video.networkState = 1;
  t.mock.timers.tick(16_000);
  await flush();
  assert.equal(state.selectedQuality, "720p");
  assert.equal(state.error, "");
});

test("a pending Chromium synchronization play cannot start old audio after cleanup", async (t) => {
  const { state, video, audio, frames } = await mountPlayer(t);
  state.audioRef = audio;
  setSources(state, true);
  await flush();
  let resolvePlay;
  video.playResult = () => new Promise((resolve) => { resolvePlay = resolve; });
  audio.onplay();
  state.selectedQuality = "360p";
  await flush();
  resolvePlay();
  await flush();
  assert.equal(audio.plays, 0);
  assert.equal(frames.size, 0);
});
