import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [{
    name: "autoplay-view-children",
    enforce: "pre",
    resolveId(id, importer) {
      if (id.endsWith(".vue") && importer?.endsWith("/VideoPlayer.vue")) return "\0autoplay-child";
    },
    load(id) { if (id === "\0autoplay-child") return "export default {};"; },
  }, vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: VideoPlayer } = await server.ssrLoadModule("/src/views/VideoPlayer.vue");

function context(t, { list, next = "playlist-next", filter = false, enabled = true } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = new Map([["yt_autoplay_enabled_v1", enabled ? "1" : "0"]]);
  for (const [name, value] of Object.entries({
    localStorage: { getItem: key => storage.get(key) ?? null },
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: { __autoplayDurationFilter: { enabled: filter } },
    document: { cookie: "" },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const navigations = [];
  const view = {
    ...VideoPlayer.methods,
    $route: { query: list ? { list } : {} },
    $router: { push: route => navigations.push(route) },
    relatedVideos: [{ videoId: "related-next" }],
    nextPlaylistVideoId: next,
  };
  return { view, navigations };
}

test("通常モードは次の関連動画へ進む", t => {
  const { view, navigations } = context(t);
  view.onPlayerEnded();
  t.mock.timers.tick(300);
  t.mock.timers.tick(3000);
  assert.deepEqual(navigations, [{ path: "/watch", query: { v: "related-next", autoplay: "1" } }]);
});

test("プレイリストは関連動画の時間フィルターにかかわらずリスト内の次へ進む", t => {
  const { view, navigations } = context(t, { list: "PL123", filter: true });
  view.onPlayerEnded();
  view.onAutoplayNoSuitableVideo();
  t.mock.timers.tick(300);
  t.mock.timers.tick(3000);
  assert.deepEqual(navigations, [{ path: "/watch", query: { v: "playlist-next", list: "PL123", autoplay: "1" } }]);
  assert.equal(view.showAutoplayNotification, undefined);
});

test("関連動画候補の通知よりプレイリスト内の次を優先し、二重遷移しない", t => {
  const { view, navigations } = context(t, { list: "PL123" });
  view.onPlayerEnded();
  view.onPlayAutoplayCandidate({ id: "related-next" });
  t.mock.timers.tick(5000);
  assert.equal(navigations.length, 1);
  assert.deepEqual(navigations[0].query, { v: "playlist-next", list: "PL123" });
});

test("プレイリストの末尾では関連動画へ移らず停止する", t => {
  const { view, navigations } = context(t, { list: "PL123", next: "", filter: true });
  view.onPlayerEnded();
  view.onPlayAutoplayCandidate({ id: "related-next" });
  t.mock.timers.tick(5000);
  assert.deepEqual(navigations, []);
});

test("自動再生オフでは遷移しない", t => {
  const { view, navigations } = context(t, { enabled: false });
  view.onPlayerEnded();
  view.onPlayAutoplayCandidate({ id: "related-next" });
  t.mock.timers.tick(5000);
  assert.deepEqual(navigations, []);
});
