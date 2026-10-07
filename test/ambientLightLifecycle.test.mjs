import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRenderer, nextTick, ssrContextKey } from "vue";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import {
  AMBIENT_LIGHT_SETTING_EVENT,
  AMBIENT_LIGHT_STORAGE_KEY,
  saveAmbientLight,
} from "../src/services/storage/settingsManager.js";

// Run the real composable and component watchers without a browser or video decoding.
const rendererImport = "@/utils/player/ambientLightRenderer.js";
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [{
    name: "ambient-lifecycle-renderer",
    enforce: "pre",
    resolveId(id) {
      const key = id.replace(fileURLToPath(new URL("../src/", import.meta.url)), "@/");
      if (key === rendererImport) return "\0ambient-lifecycle-renderer";
    },
    load(id) {
      if (id === "\0ambient-lifecycle-renderer") {
        return "export const createAmbientLightRenderer = (...args) => globalThis.ambientLifecycleCreateRenderer(...args);";
      }
    },
  }, vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { useAmbientLight } = await server.ssrLoadModule("/src/composables/useAmbientLight.js");
const { default: AmbientLight } = await server.ssrLoadModule("/src/components/player/AmbientLight.vue");
after(() => server.close());

const renderer = createRenderer({ createComment: () => ({}), insert() {}, remove() {} });
const flush = async () => { await nextTick(); await nextTick(); };
const appCleanups = new WeakMap();

class TrackedEvents extends EventTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}

function installBrowser(t, { enabled, reducedMotion = false } = {}) {
  const unmounts = [];
  appCleanups.set(t, unmounts);
  const names = ["window", "localStorage", "CustomEvent", "ambientLifecycleCreateRenderer"];
  const originals = names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const values = new Map();
  if (enabled !== undefined) values.set(AMBIENT_LIGHT_STORAGE_KEY, enabled ? "1" : "0");
  const window = new TrackedEvents();
  const motionQuery = Object.assign(new TrackedEvents(), { matches: reducedMotion });
  window.matchMedia = () => motionQuery;
  const instances = [];
  const globals = {
    window,
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    CustomEvent: class extends Event {
      constructor(type, options = {}) { super(type); this.detail = options.detail; }
    },
    ambientLifecycleCreateRenderer(video, canvas, callbacks) {
      const instance = { video, canvas, callbacks, disposed: false };
      instances.push(instance);
      return { dispose() { instance.disposed = true; } };
    },
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  t.after(() => {
    for (const unmount of unmounts) unmount();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { window, values, motionQuery, instances };
}

function trackApp(t, app) {
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    app.unmount();
    mounted = false;
  };
  appCleanups.get(t).push(unmount);
  return unmount;
}

function mountSetting(t) {
  let state;
  const app = renderer.createApp({
    setup() { state = useAmbientLight(); return () => null; },
  });
  app.mount({});
  return { state, unmount: trackApp(t, app) };
}

function mountLight(t, video = {}) {
  const app = renderer.createApp({ ...AmbientLight, render: () => null }, {
    video, thumbnail: "https://images.example/thumbnail.jpg",
  });
  app.provide(ssrContextKey, {});
  app.mount({});
  const state = app._instance.setupState;
  state.canvasRef = {};
  return { state, props: app._instance.props, unmount: trackApp(t, app) };
}

function storageEvent(window, key = AMBIENT_LIGHT_STORAGE_KEY) {
  window.dispatchEvent(Object.assign(new Event("storage"), { key }));
}

test("mounted players share the default and immediately follow settings changes", (t) => {
  const { values } = installBrowser(t);
  const first = mountSetting(t);
  const second = mountSetting(t);
  assert.equal(first.state.enabled.value, true);
  assert.equal(second.state.enabled.value, true);

  first.state.setEnabled(false);
  assert.equal(values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
  assert.equal(first.state.enabled.value, false);
  assert.equal(second.state.enabled.value, false);

  saveAmbientLight(true);
  assert.equal(first.state.enabled.value, true);
  assert.equal(second.state.enabled.value, true);
});

test("storage changes update both players, ignore other keys, and reset to the default", (t) => {
  const { window, values } = installBrowser(t);
  const first = mountSetting(t);
  const second = mountSetting(t);
  values.set(AMBIENT_LIGHT_STORAGE_KEY, "0");
  storageEvent(window, "another-setting");
  assert.equal(first.state.enabled.value, true);
  storageEvent(window);
  assert.equal(first.state.enabled.value, false);
  assert.equal(second.state.enabled.value, false);

  values.set(AMBIENT_LIGHT_STORAGE_KEY, "1");
  storageEvent(window);
  assert.equal(first.state.enabled.value, true);
  assert.equal(second.state.enabled.value, true);

  values.set(AMBIENT_LIGHT_STORAGE_KEY, "0");
  storageEvent(window);
  values.clear();
  storageEvent(window, null);
  assert.equal(first.state.enabled.value, true);
  assert.equal(second.state.enabled.value, true);
});

test("a newly mounted player preserves the saved OFF preference", (t) => {
  const { values } = installBrowser(t, { enabled: false });
  const first = mountSetting(t);
  assert.equal(first.state.enabled.value, false);
  first.unmount();
  const second = mountSetting(t);
  assert.equal(second.state.enabled.value, false);
  assert.equal(values.get(AMBIENT_LIGHT_STORAGE_KEY), "0");
});

test("unmount releases listeners while remaining players continue to synchronize", (t) => {
  const { window, values } = installBrowser(t, { enabled: false });
  const first = mountSetting(t);
  const second = mountSetting(t);
  assert.equal(window.listenerCount(AMBIENT_LIGHT_SETTING_EVENT), 2);
  assert.equal(window.listenerCount("storage"), 2);
  first.unmount();
  assert.equal(window.listenerCount(AMBIENT_LIGHT_SETTING_EVENT), 1);
  assert.equal(window.listenerCount("storage"), 1);
  saveAmbientLight(true);
  assert.equal(first.state.enabled.value, false);
  assert.equal(second.state.enabled.value, true);
  second.unmount();
  assert.equal(window.listenerCount(AMBIENT_LIGHT_SETTING_EVENT), 0);
  assert.equal(window.listenerCount("storage"), 0);
  values.set(AMBIENT_LIGHT_STORAGE_KEY, "0");
  storageEvent(window);
  assert.equal(second.state.enabled.value, true);
});

test("the light stops rendering when disabled, resumes, and releases replaced media", async (t) => {
  const { instances, motionQuery } = installBrowser(t);
  const video = {};
  const light = mountLight(t, video);
  await flush();
  assert.equal(instances.length, 1);
  assert.equal(instances[0].video, video);
  instances[0].callbacks.onFrame();
  assert.equal(light.state.hasFrame, true);

  saveAmbientLight(false);
  await flush();
  assert.equal(instances[0].disposed, true);
  assert.equal(light.state.hasFrame, false);
  assert.equal(instances.length, 1);

  saveAmbientLight(true);
  await flush();
  assert.equal(instances.length, 2);
  const replacement = {};
  light.props.video = replacement;
  await flush();
  assert.equal(instances[1].disposed, true);
  assert.equal(instances[2].video, replacement);
  light.unmount();
  assert.equal(instances[2].disposed, true);
  assert.equal(motionQuery.listenerCount("change"), 0);
});

test("reduced motion keeps the thumbnail and suspends live rendering", async (t) => {
  const { instances, motionQuery } = installBrowser(t, { reducedMotion: true });
  const light = mountLight(t);
  light.state.thumbnailLoaded = true;
  await flush();
  assert.equal(light.state.enabled, true);
  assert.equal(light.state.thumbnailLoaded, true);
  assert.equal(light.state.hasFrame, false);
  assert.equal(instances.length, 0);

  motionQuery.matches = false;
  motionQuery.dispatchEvent(new Event("change"));
  await flush();
  assert.equal(instances.length, 1);
  instances[0].callbacks.onFrame();
  motionQuery.matches = true;
  motionQuery.dispatchEvent(new Event("change"));
  await flush();
  assert.equal(instances[0].disposed, true);
  assert.equal(light.state.hasFrame, false);
  assert.equal(light.state.thumbnailLoaded, true);
});
