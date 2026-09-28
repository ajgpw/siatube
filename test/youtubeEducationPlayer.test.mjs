import test from "node:test";
import assert from "node:assert/strict";

import {
  createYoutubeEducationEmbedUrl,
  loadYoutubeEducationPlayerData,
} from
  "../src/utils/player/youtubeEducationPlayer.js";

test("Educationホスト用のIFrame Player API URLを生成する", () => {
  globalThis.window = {
    location: {
      protocol: "https:",
      origin: "https://youtube.com",
      href: "https://youtube.com/watch?v=video-id",
    },
  };

  const result = createYoutubeEducationEmbedUrl(
    "video-id",
    "?foo=bar&amp;controls=0",
    { autoplay: true },
  );
  const url = new URL(result);

  assert.equal(url.hostname, "www.youtubeeducation.com");
  assert.equal(url.pathname, "/embed/video-id");
  assert.equal(url.searchParams.get("foo"), "bar");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(url.searchParams.get("controls"), "1");
  assert.equal(url.searchParams.get("playsinline"), "1");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("origin"), "https://youtube.com");
  assert.equal(
    url.searchParams.get("forigin"),
    "https://youtube.com/watch?v=video-id",
  );
});

test("スプレッドシートのA1とA2を同じリクエストで読み込む", async () => {
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () => `google.visualization.Query.setResponse(${JSON.stringify({
        status: "ok",
        table: {
          rows: [
            { c: [{ v: "?foo=bar" }] },
            { c: [{ v: "window.YT = { Player() {} };" }] },
          ],
        },
      })});`,
    };
  };

  const data = await loadYoutubeEducationPlayerData();
  const url = new URL(requestedUrl);

  assert.equal(url.searchParams.get("range"), "A1:A2");
  assert.equal(data.parameterText, "?foo=bar");
  assert.match(data.widgetApiSource, /window\.YT/);
});
