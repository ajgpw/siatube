import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRenderer, markRaw, nextTick, ssrContextKey } from "vue";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import {
  AMBIENT_LIGHT_STORAGE_KEY,
  saveAmbientLight,
} from "../src/services/storage/settingsManager.js";

// Run the real Education component and settings watchers; replace only media capture
// and network/player API services so permission and disposal races are deterministic.
const stubs = {
  "@/services/api/siatubeApi.js": `
    export const youtubeEducationStream = (...args) => globalThis.educationLifecycleFetch(...args);
  `,
  "@/utils/player/youtubeEducationPlayer.js": `
    export const configureYoutubeEducationEmbedUrl = url => url;
    export const loadYoutubeEducationPlayerData = async () => null;
    export const ensureYoutubeEducationPlayerApi = async () => {};
  `,
  "@/utils/player/educationAmbientCapture.js": `
    export const supportsEducationAmbientCapture = () => globalThis.educationLifecycleSupported;
    export const startEducationAmbientCapture = (...args) => globalThis.educationLifecycleCapture(...args);
  `,
};
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [{
    name: "education-ambient-lifecycle-services",
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
const { default: StreamType1 } = await server.ssrLoadModule("/src/components/player/StreamType1.vue");
after(() => server.close());

const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} });
async function flush() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeSession() {
  const session = {
    video: markRaw({ capture: true }),
    stops: 0,
  };
  session.stop = () => { session.stops++; };
  return session;
}

async function mountPlayer(t, { enabled, supported = true, reducedMotion = false } = {}) {
  const names = [
    "window", "document", "localStorage", "CustomEvent",
    "educationLifecycleFetch", "educationLifecycleCapture", "educationLifecycleSupported",
  ];
  const originals = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const values = new Map([["yt_autoplay_enabled_v1", "0"]]);
  if (enabled !== undefined) values.set(AMBIENT_LIGHT_STORAGE_KEY, enabled ? "1" : "0");
  const motionQuery = Object.assign(new EventTarget(), { matches: reducedMotion });
  const window = Object.assign(new EventTarget(), {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: id => clearTimeout(id),
    matchMedia: () => motionQuery,
  });
  const requests = [];
  const fetches = [];
  const globals = {
    window,
    document: Object.assign(new EventTarget(), { cookie: "" }),
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    CustomEvent: class extends Event {
      constructor(type, options = {}) { super(type); this.detail = options.detail; }
    },
    educationLifecycleSupported: supported,
    educationLifecycleFetch(id) {
      fetches.push(id);
      return Promise.resolve({ url: `https://www.youtubeeducation.com/embed/${id}` });
    },
    educationLifecycleCapture(element, options) {
      const request = { ...deferred(), element, options };
      requests.push(request);
      return request.promise;
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  const sources = [];
  const app = renderer.createApp({ ...StreamType1, render: () => null }, {
    videoId: "abcdefghijk",
    onAmbientSource: source => sources.push(source),
  });
  app.provide(ssrContextKey, {});
  app.mount({});
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    app.unmount();
    mounted = false;
  };
  const state = app._instance.setupState;
  const host = markRaw({ isConnected: true });
  state.playerHostRef = host;
  state.iframeRef = { isConnected: true };
  state.iframeLoaded = true;
  await flush();
  t.after(() => {
    unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const change = checked => state.handleAmbientLightChange({ target: { checked } });
  return { state, instance: app._instance, props: app._instance.props, host, sources, requests, values, fetches, window, motionQuery, unmount, change };
}

async function enableCapture(player) {
  const operation = player.change(true);
  assert.equal(player.requests.length, 1, "capture must begin in the checkbox event, before a microtask");
  const session = makeSession();
  player.requests[0].resolve(session);
  await operation;
  await flush();
  return session;
}

test("Education reports an ended video and selects the next related video once even without sheet data", async t => {
  const mounted = await mountPlayer(t);
  const events = [];
  const emitted = [];
  mounted.state.autoplayEnabled = true;
  mounted.window.YT = {
    Player: class {
      constructor(iframe, options) { events.push(options.events); }
      destroy() {}
      playVideo() {}
      mute() {}
    },
  };
  globalThis.document.querySelectorAll = () => [{ getAttribute: () => "next-related" }];
  // Observe the real component events after its forwarding layer.
  const instance = mounted.instance;
  instance.vnode.props.onEnded = () => emitted.push("ended");
  instance.vnode.props.onPlayAutoplayCandidate = candidate => emitted.push(candidate);
  mounted.state.reloadStream();
  await flush();
  assert.equal(events.length, 1);
  events[0].onStateChange({ data: 0 });
  events[0].onStateChange({ data: 0 });
  assert.deepEqual(emitted, ["ended", { id: "next-related" }]);
});

test("Education starts OFF and global ON cannot open a permission prompt", async t => {
  const player = await mountPlayer(t);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.requests.length, 0);
  assert.equal(player.sources.filter(Boolean).length, 0);

  saveAmbientLight(false);
  await flush();
  saveAmbientLight(true);
  await flush();
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.requests.length, 0);
});

test("explicit ON requests permission immediately and emits only the captured video", async t => {
  const player = await mountPlayer(t, { enabled: false });
  const operation = player.change(true);
  assert.equal(player.requests.length, 1);
  assert.equal(player.requests[0].element, player.host);
  assert.equal(player.requests[0].options.signal.aborted, false);
  assert.equal(player.state.capturePending, true);
  assert.equal(player.sources.filter(Boolean).length, 0);

  const session = makeSession();
  player.requests[0].resolve(session);
  await operation;
  await flush();
  assert.equal(player.state.captureEnabled, true);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "1");
  assert.deepEqual(player.sources.at(-1), { video: session.video, visibilityTarget: player.host });
});

test("turning OFF stops capture without disabling the Type 2 preference", async t => {
  const player = await mountPlayer(t);
  const session = await enableCapture(player);
  player.change(false);
  await flush();
  assert.ok(session.stops > 0);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.requests[0].options.signal.aborted, true);
  assert.equal(player.sources.at(-1), null);
  assert.notEqual(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
});

test("every new ON requests a new session instead of reusing an old permission", async t => {
  const player = await mountPlayer(t);
  const first = await enableCapture(player);
  player.change(false);
  await flush();
  const operation = player.change(true);
  assert.equal(player.requests.length, 2);
  assert.notEqual(player.requests[0].options.signal, player.requests[1].options.signal);
  const second = makeSession();
  player.requests[1].resolve(second);
  await operation;
  await flush();
  assert.ok(first.stops > 0);
  assert.equal(second.stops, 0);
  assert.equal(player.sources.at(-1).video, second.video);
});

test("global OFF stops Education and global ON never restarts sharing", async t => {
  const player = await mountPlayer(t);
  const session = await enableCapture(player);
  saveAmbientLight(false);
  await flush();
  assert.ok(session.stops > 0);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.sources.at(-1), null);
  saveAmbientLight(true);
  await flush();
  assert.equal(player.requests.length, 1);
  assert.equal(player.state.captureEnabled, false);
});

test("permission cancellation leaves Education OFF and supplies no source", async t => {
  const player = await mountPlayer(t);
  const operation = player.change(true);
  player.requests[0].reject(new DOMException("The user cancelled sharing", "NotAllowedError"));
  await operation;
  await flush();
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.sources.filter(Boolean).length, 0);
});

test("cancelling permission preserves a saved Type 2 OFF preference", async t => {
  const player = await mountPlayer(t, { enabled: false });
  const operation = player.change(true);
  assert.equal(player.requests.length, 1);
  assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
  player.requests[0].reject(new DOMException("The user cancelled sharing", "NotAllowedError"));
  await operation;
  await flush();
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
  assert.equal(player.sources.filter(Boolean).length, 0);
});

test("global OFF promptly cancels pending permission and rejects a late capture", async t => {
  const player = await mountPlayer(t, { enabled: true });
  const operation = player.change(true);
  assert.equal(player.requests.length, 1);
  assert.equal(player.state.capturePending, true);
  saveAmbientLight(false);
  assert.equal(player.requests[0].options.signal.aborted, true);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  const lateSession = makeSession();
  player.requests[0].resolve(lateSession);
  await operation;
  await flush();
  assert.ok(lateSession.stops > 0);
  assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
  assert.equal(player.sources.filter(Boolean).length, 0);
  saveAmbientLight(true);
  await flush();
  assert.equal(player.requests.length, 1);
  assert.equal(player.state.captureEnabled, false);
});

for (const source of ["settings", "storage"]) {
  test(`${source} OFF cancels pending permission even when the saved preference was already OFF`, async t => {
    const player = await mountPlayer(t, { enabled: false });
    const operation = player.change(true);
    assert.equal(player.requests.length, 1);
    assert.equal(player.state.capturePending, true);
    assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
    if (source === "settings") saveAmbientLight(false);
    else player.window.dispatchEvent(Object.assign(new Event("storage"), { key: AMBIENT_LIGHT_STORAGE_KEY }));
    assert.equal(player.requests[0].options.signal.aborted, true);
    assert.equal(player.state.captureEnabled, false);
    assert.equal(player.state.capturePending, false);
    const lateSession = makeSession();
    player.requests[0].resolve(lateSession);
    await operation;
    await flush();
    assert.ok(lateSession.stops > 0);
    assert.equal(player.values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
    assert.equal(player.sources.filter(Boolean).length, 0);
  });
}

test("unsupported capture does not request sharing or enable the light", async t => {
  const player = await mountPlayer(t, { supported: false });
  await player.change(true);
  await flush();
  assert.equal(player.requests.length, 0);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.sources.filter(Boolean).length, 0);
});

test("reduced motion blocks capture and stops a running capture without auto-restart", async t => {
  const player = await mountPlayer(t, { reducedMotion: true });
  await player.change(true);
  await flush();
  assert.equal(player.requests.length, 0);
  assert.equal(player.state.captureEnabled, false);

  player.motionQuery.matches = false;
  player.motionQuery.dispatchEvent(new Event("change"));
  await flush();
  const session = await enableCapture(player);
  player.motionQuery.matches = true;
  player.motionQuery.dispatchEvent(new Event("change"));
  await flush();
  assert.ok(session.stops > 0);
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.sources.at(-1), null);
  player.motionQuery.matches = false;
  player.motionQuery.dispatchEvent(new Event("change"));
  await flush();
  assert.equal(player.requests.length, 1);
});

test("a wrong capture source reports a capture error without breaking playback", async t => {
  const player = await mountPlayer(t);
  const operation = player.change(true);
  player.requests[0].reject(Object.assign(new Error("Select this tab"), { code: "EDUCATION_CAPTURE_CURRENT_TAB" }));
  await operation;
  await flush();
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.ok(player.state.captureError);
  assert.equal(player.state.error, "");
  assert.match(player.state.streamUrl, /youtubeeducation\.com/);
  assert.equal(player.sources.filter(Boolean).length, 0);
});

test("browser sharing-stop clears the source and requires a new ON", async t => {
  const player = await mountPlayer(t);
  await enableCapture(player);
  player.requests[0].options.onEnded();
  await flush();
  assert.equal(player.state.captureEnabled, false);
  assert.equal(player.state.capturePending, false);
  assert.equal(player.sources.at(-1), null);
  assert.equal(player.requests.length, 1);
});

for (const action of ["reload", "video change", "page hide", "unmount"]) {
  test(`${action} stops active sharing and cannot silently start it again`, async t => {
    const player = await mountPlayer(t);
    const session = await enableCapture(player);
    if (action === "reload") player.state.reloadStream();
    if (action === "video change") player.props.videoId = "lmnopqrstuv";
    if (action === "page hide") player.window.dispatchEvent(new Event("pagehide"));
    if (action === "unmount") player.unmount();
    await flush();
    assert.ok(session.stops > 0);
    assert.equal(player.requests[0].options.signal.aborted, true);
    assert.equal(player.sources.at(-1), null);
    assert.equal(player.requests.length, 1);
    if (action !== "unmount") assert.equal(player.state.captureEnabled, false);
  });
}

for (const action of ["OFF", "reload", "video change", "page hide", "unmount"]) {
  test(`late permission after ${action} is released and never attached`, async t => {
    const player = await mountPlayer(t);
    const operation = player.change(true);
    assert.equal(player.requests.length, 1);
    if (action === "OFF") player.change(false);
    if (action === "reload") player.state.reloadStream();
    if (action === "video change") player.props.videoId = "lmnopqrstuv";
    if (action === "page hide") player.window.dispatchEvent(new Event("pagehide"));
    if (action === "unmount") player.unmount();
    await flush();
    assert.equal(player.requests[0].options.signal.aborted, true);
    const lateSession = makeSession();
    player.requests[0].resolve(lateSession);
    await operation;
    await flush();
    assert.ok(lateSession.stops > 0);
    assert.equal(player.sources.filter(Boolean).length, 0);
  });
}

test("a replaced pending request cannot publish over a newer successful capture", async t => {
  const player = await mountPlayer(t);
  const oldOperation = player.change(true);
  player.change(false);
  const newOperation = player.change(true);
  assert.equal(player.requests.length, 2);
  const currentSession = makeSession();
  player.requests[1].resolve(currentSession);
  await newOperation;
  await flush();
  const staleSession = makeSession();
  player.requests[0].resolve(staleSession);
  await oldOperation;
  await flush();
  assert.ok(staleSession.stops > 0);
  assert.equal(currentSession.stops, 0);
  assert.equal(player.state.captureEnabled, true);
  assert.equal(player.sources.at(-1).video, currentSession.video);
});
