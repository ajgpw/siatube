import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

// Render the real parent template, keeping stream requests and media outside this test.
const childNames = new Set(["AmbientLight", "StreamType1", "StreamType2", "StreamType3"]);
const virtualPrefix = "\0stream-player-surface:";
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [{
    name: "stream-player-surface-children",
    enforce: "pre",
    resolveId(id, importer) {
      if (!importer?.endsWith("/StreamPlayer.vue")) return;
      const name = id.match(/^\.\/([^/]+)\.vue$/)?.[1];
      if (childNames.has(name)) return `${virtualPrefix}${name}`;
    },
    load(id) {
      if (!id.startsWith(virtualPrefix)) return;
      const name = id.slice(virtualPrefix.length);
      const tag = name === "StreamType3" ? "button" : "div";
      return `import { h } from "vue";
        export default { render() { return h(${JSON.stringify(tag)}, {
          "data-player-child": ${JSON.stringify(name)}
        }); } };`;
    },
  }, vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
after(() => server.close());
const { default: StreamPlayer } = await server.ssrLoadModule("/src/components/player/StreamPlayer.vue");

async function renderPlayer(t, streamType) {
  t.mock.method(console, "log", () => {});
  return renderToString(createSSRApp(StreamPlayer, { videoId: "example", streamType }));
}

test("download mode has no black player surface around its rounded button", async (t) => {
  const html = await renderPlayer(t, "3");
  assert.match(html, /<button\b[^>]*data-player-child="StreamType3"/);
  assert.doesNotMatch(html, /\bclass="[^"]*\bplayer-surface\b/);
  assert.doesNotMatch(html, /data-player-child="AmbientLight"/);
});

test("both video modes retain their rounded player surface and ambient light", async (t) => {
  for (const streamType of ["1", "2"]) {
    const html = await renderPlayer(t, streamType);
    assert.match(html, /\bclass="[^"]*\bplayer-surface\b/);
    assert.match(html, new RegExp(`data-player-child="StreamType${streamType}"`));
    assert.match(html, /data-player-child="AmbientLight"/);
    assert.doesNotMatch(html, /data-player-child="StreamType3"/);
  }
});
