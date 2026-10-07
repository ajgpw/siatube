import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRenderer, nextTick, reactive, ssrContextKey } from "vue";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";
import { routeLocationKey } from "vue-router";
import { useSidebar } from "../src/composables/useSidebar.js";
import { useSettingsModal } from "../src/composables/useSettingsModal.js";

// Load real component setup and the update service's raw import without an HTTP server.
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const { useAppNotifications } = await server.ssrLoadModule("/src/composables/useAppNotifications.js");
const { default: Sidebar } = await server.ssrLoadModule("/src/components/layout/Sidebar.vue");
after(() => server.close());

const renderer = createRenderer({
  createComment: () => ({}),
  insert() {},
  remove() {},
});

function installBrowser(t, width = 1400) {
  const originals = new Map(["window", "document", "localStorage", "fetch"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)],
  ));
  const values = new Map();
  const classes = new Set();
  const styles = new Map();
  const window = new EventTarget();
  window.innerWidth = width;
  globalThis.window = window;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  let documentWrites = 0;
  globalThis.document = {
    body: {
      classList: {
        toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
        remove: (name) => classes.delete(name),
      },
      style: { setProperty: (name, value) => styles.set(name, value) },
    },
    open() { documentWrites += 1; },
    write() {},
    close() {},
  };
  // Tests must never make live update requests.
  globalThis.fetch = async () => new Response("0.0.0");
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return { window, values, classes, styles, getDocumentWrites: () => documentWrites };
}

function mount(useComposable) {
  let state;
  const app = renderer.createApp({
    setup() {
      state = useComposable();
      return () => null;
    },
  });
  app.mount({});
  return { state, unmount: () => app.unmount() };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const flushRequests = () => new Promise((resolve) => setImmediate(resolve));

test("sidebar follows viewport changes and restores its state after a watch route", async (t) => {
  const { window } = installBrowser(t);
  const route = reactive({ path: "/" });
  const { state, unmount } = mount(() => useSidebar(route));
  assert.equal(state.sidebarOpen.value, true);
  route.path = "/watch";
  await nextTick();
  assert.equal(state.sidebarOpen.value, false);
  route.path = "/search";
  await nextTick();
  assert.equal(state.sidebarOpen.value, true);
  window.innerWidth = 700;
  window.dispatchEvent(new Event("resize"));
  assert.equal(state.sidebarOpen.value, false);
  unmount();
  window.innerWidth = 1400;
  window.dispatchEvent(new Event("resize"));
  assert.equal(state.sidebarOpen.value, false, "resize listener is removed");
});

test("opening a watch URL directly starts compact and restores the prior desktop state", async (t) => {
  installBrowser(t);
  const route = reactive({ path: "/watch" });
  const { state, unmount } = mount(() => useSidebar(route));
  assert.equal(state.sidebarOpen.value, false, "direct watch navigation starts compact");
  route.path = "/search";
  await nextTick();
  assert.equal(state.sidebarOpen.value, true, "leaving restores the desktop default");

  state.handleToggleSidebar(false);
  route.path = "/watch";
  await nextTick();
  route.path = "/";
  await nextTick();
  assert.equal(state.sidebarOpen.value, false, "a user's compact state survives a watch visit");
  unmount();
});

test("resizing a watch page keeps the sidebar compact and its toggle remains usable", async (t) => {
  const { window } = installBrowser(t);
  const route = reactive({ path: "/" });
  const { state, unmount } = mount(() => useSidebar(route));
  state.handleToggleSidebar(false);
  route.path = "/watch";
  await nextTick();
  for (const width of [1000, 1329, 1330, 1800]) {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
    assert.equal(state.sidebarOpen.value, false, `watch sidebar stays compact at ${width}px`);
  }

  state.handleToggleSidebar(true);
  assert.equal(state.sidebarOpen.value, true, "the menu toggle can expand the sidebar");
  state.handleToggleSidebar(false);
  assert.equal(state.sidebarOpen.value, false, "the menu toggle can compact it again");
  state.handleToggleSidebar(true);
  window.dispatchEvent(new Event("resize"));
  assert.equal(state.sidebarOpen.value, false, "a viewport change restores the compact watch layout");
  route.path = "/search";
  await nextTick();
  assert.equal(state.sidebarOpen.value, false, "leaving restores the pre-watch user preference");
  unmount();
});

test("watch Sidebar respects a compact prop at desktop boundaries and cleans up resizing", async (t) => {
  const { window, values, classes, styles } = installBrowser(t, 1000);
  t.mock.method(console, "log", () => {});
  const app = renderer.createApp({ ...Sidebar, render: () => null }, {
    open: false, isWatchPage: true,
  });
  app.provide(routeLocationKey, reactive({ path: "/watch" }));
  app.provide(ssrContextKey, {});
  app.mount({});
  const state = app._instance.setupState;
  await nextTick();
  for (const width of [1000, 1329, 1330]) {
    window.innerWidth = width;
    window.dispatchEvent(new Event("resize"));
    await nextTick();
    assert.equal(state.isOpen, false, `open=false remains compact at ${width}px`);
    assert.equal(state.isHidden, false, `navigation remains visible at ${width}px`);
    assert.equal(classes.has("sidebar-compact"), true);
    assert.equal(classes.has("sidebar-hidden"), false);
    assert.equal(styles.get("--sidebar-offset"), "70px");
    assert.equal(values.get("youtube_sidebar_state"), "compact");
  }

  window.innerWidth = 999;
  window.dispatchEvent(new Event("resize"));
  await nextTick();
  assert.equal(state.isHidden, true, "watch navigation changes below the PC boundary");
  window.innerWidth = 1330;
  window.dispatchEvent(new Event("resize"));
  await nextTick();
  app._instance.props.open = true;
  await nextTick();
  assert.equal(state.isOpen, true, "the component follows the menu toggle prop");
  assert.equal(styles.get("--sidebar-offset"), "250px");
  app._instance.props.open = false;
  await nextTick();
  assert.equal(state.isOpen, false);

  app.unmount();
  assert.equal(classes.has("sidebar-compact"), false);
  assert.equal(classes.has("sidebar-hidden"), false);
  window.innerWidth = 1000;
  window.dispatchEvent(new Event("resize"));
  await nextTick();
  assert.equal(state.viewportWidth, 1330, "the unmounted Sidebar releases its resize listener");
});

test("settings dialog syncs storage and releases its listener and body class", async (t) => {
  const { window, values, classes } = installBrowser(t);
  values.set("settingsModalOpen", "true");
  const { state, unmount } = mount(useSettingsModal);
  assert.equal(state.isOpen.value, false, "a fresh page starts closed");
  state.openSettingsModal();
  await nextTick();
  assert.equal(values.get("settingsModalOpen"), "true");
  assert.equal(classes.has("settings-modal-open"), true);
  const storageEvent = Object.assign(new Event("storage"), {
    key: "settingsModalOpen", newValue: "false",
  });
  window.dispatchEvent(storageEvent);
  await nextTick();
  assert.equal(state.isOpen.value, false);
  assert.equal(classes.has("settings-modal-open"), false);
  state.openSettingsModal();
  await nextTick();
  unmount();
  assert.equal(classes.has("settings-modal-open"), false);
  window.dispatchEvent(storageEvent);
  assert.equal(state.isOpen.value, true, "storage listener is removed");
});

test("connection and guard notifications stop responding after unmount", async (t) => {
  const { window } = installBrowser(t);
  let settingsOpened = 0;
  const { state, unmount } = mount(() => useAppNotifications(() => { settingsOpened += 1; }));
  window.dispatchEvent(new Event("siatube-api-connection-failure"));
  assert.equal(state.connectionFailurePrompt.value, true);
  state.openProxySettings();
  assert.equal(state.connectionFailurePrompt.value, false);
  assert.equal(settingsOpened, 1);
  window.dispatchEvent(new CustomEvent("siatube-guard-progress", {
    detail: { state: "rate-limited", retryAfter: 5 },
  }));
  assert.match(state.guardProgressMessage.value, /5秒/);
  unmount();
  window.dispatchEvent(new Event("siatube-api-connection-failure"));
  window.dispatchEvent(new CustomEvent("siatube-guard-progress", {
    detail: { state: "complete" },
  }));
  assert.equal(state.connectionFailurePrompt.value, false);
  assert.match(state.guardProgressMessage.value, /5秒/);
  await flushRequests();
});

test("a version response arriving after unmount cannot start an automatic update", async (t) => {
  const { getDocumentWrites } = installBrowser(t);
  const response = deferred();
  let requests = 0;
  globalThis.fetch = () => { requests += 1; return response.promise; };
  const { unmount } = mount(() => useAppNotifications(() => {}));
  unmount();
  response.resolve(new Response("9999.0.0"));
  await flushRequests();
  assert.equal(requests, 1);
  assert.equal(getDocumentWrites(), 0);
});

test("an HTML response arriving after unmount cannot replace the document", async (t) => {
  const { getDocumentWrites } = installBrowser(t);
  const response = deferred();
  const buildRequested = deferred();
  globalThis.fetch = (url) => {
    if (url.endsWith("version.txt")) return Promise.resolve(new Response("9999.0.0"));
    buildRequested.resolve();
    return response.promise;
  };
  const { unmount } = mount(() => useAppNotifications(() => {}));
  await buildRequested.promise;
  unmount();
  response.resolve(new Response("<!doctype html><html></html>"));
  await flushRequests();
  assert.equal(getDocumentWrites(), 0);
});
