import test from "node:test";
import assert from "node:assert/strict";

import {
  configureYoutubeEducationEmbedUrl,
  createYoutubeEducationEmbedUrl,
  ensureYoutubeEducationPlayerApi,
  loadYoutubeEducationPlayerData,
} from
  "../src/utils/player/youtubeEducationPlayer.js";

test("取得したEducation URLの認証パラメータを保持してAPIと自動再生を有効にする", () => {
  const url = new URL(configureYoutubeEducationEmbedUrl(
    "https://www.youtubeeducation.com/embed/abcdefghijk?token=a%2Bb&enablejsapi=0&autoplay=0",
    { autoplay: true },
  ));
  assert.equal(url.pathname, "/embed/abcdefghijk");
  assert.equal(url.searchParams.get("token"), "a+b");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(new URL(configureYoutubeEducationEmbedUrl(url.href)).searchParams.get("autoplay"), "0");
});

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

test("補助設定を取得できなくても公式IFrame APIを読み込める", async () => {
  let appendedScript;
  globalThis.window = {
    setInterval, clearInterval, setTimeout, clearTimeout,
  };
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({}),
    head: {
      appendChild(script) {
        appendedScript = script;
        window.YT = { Player() {} };
        window.onYouTubeIframeAPIReady();
      },
    },
  };
  const api = await ensureYoutubeEducationPlayerApi();
  assert.equal(appendedScript.src, "https://www.youtube.com/iframe_api");
  assert.equal(api, window.YT);
});
