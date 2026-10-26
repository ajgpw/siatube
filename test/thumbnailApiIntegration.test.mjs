import test from "node:test";
import assert from "node:assert/strict";

import { channel, playlist, search, video } from "../src/services/api/siatubeApi.js";
import { __resetThumbnailSourceForTests } from "../src/services/network/thumbnailSource.js";
import {
  __resetGuardSessionForTests,
  saveGuardSession,
} from "../src/services/guard/guard-session.js";
import { __resetChallengeForTests } from "../src/services/guard/challenge.js";

const VIDEO_ID = "dQw4w9WgXcQ";
const SESSION_ID = "S".repeat(43);
const CHALLENGE_ID = "H".repeat(22);
const DATA_IMAGE = "data:image/jpeg;base64,AAECAw==";
const YOUTUBE_IMAGE = `https://img.youtube.com/vi/${VIDEO_ID}/hqdefault.jpg`;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installGlobals(t, { youtube = false, proxy = false, verified = true } = {}) {
  const originals = {
    fetch: globalThis.fetch,
    Image: globalThis.Image,
    localStorage: globalThis.localStorage,
  };
  const storage = new Map();
  const images = [];
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  __resetGuardSessionForTests();
  __resetChallengeForTests();
  __resetThumbnailSourceForTests();
  globalThis.Image = class {
    set src(value) {
      this.currentSrc = value;
      if (!value) return;
      const url = new URL(value);
      images.push(url);
      const available = url.hostname === "img.youtube.com" ? youtube : proxy;
      this.width = this.naturalWidth = available ? 120 : 0;
      this.height = this.naturalHeight = available ? 90 : 0;
      queueMicrotask(() => {
        if (available) this.onload?.();
        else this.onerror?.();
      });
    }
  };
  if (verified) {
    saveGuardSession({
      version: 1,
      sessionId: SESSION_ID,
      expiresAt: Date.now() + 60_000,
      verifiedUntil: Date.now() + 60_000,
    });
  }
  t.after(() => {
    __resetGuardSessionForTests();
    __resetChallengeForTests();
    __resetThumbnailSourceForTests();
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return images;
}

const resources = [
  ["search", () => search({ q: "猫", token: "next+page", raw: true }, { retries: 0 })],
  ["video", () => video(VIDEO_ID, { token: "related+page", depth: 2, raw: true, retries: 0 })],
  ["channel", () => channel("UCexample", { raw: true, retries: 0 })],
  ["playlist", () => playlist("PLexample", { token: "next+page", v: VIDEO_ID, raw: true, retries: 0 })],
];

for (const mode of ["youtube", "url", "txt"]) {
  for (const [name, request] of resources) {
    test(`${name} requests img=${mode} using the available thumbnail route`, async (t) => {
      const images = installGlobals(t, {
        youtube: mode === "youtube",
        proxy: mode === "url",
      });
      const requests = [];
      globalThis.fetch = async (input) => {
        requests.push(new URL(input));
        return jsonResponse({
          videoId: VIDEO_ID,
          thumbnail: mode === "url" ? VIDEO_ID : mode === "youtube" ? YOUTUBE_IMAGE : DATA_IMAGE,
        });
      };

      const payload = await request();

      assert.equal(requests.length, 1);
      assert.equal(requests[0].searchParams.get("img"), mode);
      assert.equal(requests[0].searchParams.get("raw"), "true");
      assert.equal(requests[0].searchParams.get("guard_sid"), SESSION_ID);
      if (name === "search" || name === "playlist") {
        assert.equal(requests[0].searchParams.get("token"), "next+page");
      }
      if (name === "playlist") {
        assert.equal(requests[0].searchParams.get("v"), VIDEO_ID);
      }
      if (name === "video") {
        assert.equal(decodeURIComponent(requests[0].pathname),
          `/api/video/${VIDEO_ID}====token==i==related+page==p==depth==i==2`);
      }
      if (mode === "url") {
        const thumbnail = new URL(payload.thumbnail);
        assert.equal(thumbnail.origin, "https://siatube-web.online");
        assert.equal(thumbnail.searchParams.get("token"), VIDEO_ID);
        assert.equal(thumbnail.searchParams.get("guard_sid"), SESSION_ID);
        for (const image of images.filter((url) => url.hostname === "siatube-web.online")) {
          assert.equal(image.searchParams.get("guard_sid"), SESSION_ID);
        }
      } else {
        assert.equal(payload.thumbnail, mode === "youtube" ? YOUTUBE_IMAGE : DATA_IMAGE);
      }
      assert.equal(images[0].hostname, "img.youtube.com");
      assert.equal(images.some((url) => url.hostname === "siatube-web.online"), mode !== "youtube");
    });
  }
}

test("a new session authenticates the url request before checking the thumbnail proxy", async (t) => {
  const images = installGlobals(t, { proxy: true, verified: false });
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    if (url.pathname === "/api/search") {
      if (!url.searchParams.has("guard_sid")) {
        return jsonResponse({ code: "CHALLENGE_REQUIRED", sessionId: SESSION_ID }, 403);
      }
      return jsonResponse({ items: [{ videoId: VIDEO_ID, thumbnails: [{ url: VIDEO_ID }] }] });
    }
    if (url.pathname.endsWith("/status")) {
      return jsonResponse({ verified: false, sessionId: SESSION_ID });
    }
    if (url.pathname.endsWith("/challenge")) {
      return jsonResponse({
        sessionId: SESSION_ID,
        challengeId: CHALLENGE_ID,
        nonce: "thumbnail-integration",
        difficultyBits: 0,
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        version: 1,
      });
    }
    if (url.pathname.endsWith("/verify")) {
      return jsonResponse({
        ok: true,
        sessionId: SESSION_ID,
        verifiedUntil: Math.floor(Date.now() / 1_000) + 60,
      });
    }
    throw new Error(`Unexpected request path: ${url.pathname}`);
  };

  const payload = await search({ q: "猫", token: "next+page" }, { retries: 0, timeout: 0 });

  const searches = requests.filter((url) => url.pathname === "/api/search");
  assert.equal(searches.length, 2);
  assert.equal(searches[0].searchParams.get("guard_sid"), null);
  assert.equal(searches[1].searchParams.get("guard_sid"), SESSION_ID);
  for (const url of searches) {
    assert.equal(url.searchParams.get("img"), "url");
    assert.equal(url.searchParams.get("token"), "next+page");
  }
  const thumbnail = new URL(payload.items[0].thumbnails[0].url);
  assert.equal(thumbnail.searchParams.get("guard_sid"), SESSION_ID);
  assert.equal(images.filter((url) => url.hostname === "siatube-web.online").length, 1);
  assert.equal(images.at(-1).searchParams.get("guard_sid"), SESSION_ID);
});

test("a blocked proxy after authentication refetches the same page as base64", async (t) => {
  installGlobals(t, { verified: false });
  const requests = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    requests.push(url);
    return jsonResponse({
      sessionId: SESSION_ID,
      verifiedUntil: Math.floor(Date.now() / 1_000) + 60,
      items: [{ videoId: VIDEO_ID, thumbnail: url.searchParams.get("img") === "txt" ? DATA_IMAGE : VIDEO_ID }],
      nextToken: "continuation",
    });
  };

  const payload = await playlist("PLexample", {
    token: "next+page",
    v: VIDEO_ID,
    raw: true,
    retries: 0,
  });

  assert.deepEqual(requests.map((url) => url.searchParams.get("img")), ["url", "txt"]);
  for (const url of requests) {
    assert.equal(url.pathname, "/api/playlist/PLexample");
    assert.equal(url.searchParams.get("token"), "next+page");
    assert.equal(url.searchParams.get("v"), VIDEO_ID);
    assert.equal(url.searchParams.get("raw"), "true");
  }
  assert.equal(requests[1].searchParams.get("guard_sid"), SESSION_ID);
  assert.equal(payload.items[0].thumbnail, DATA_IMAGE);
  assert.equal(payload.nextToken, "continuation");
  assert.equal("sessionId" in payload, false);
});

test("aborting during route detection prevents the API request", async (t) => {
  installGlobals(t);
  let fetched = false;
  let imageStarted;
  let pendingImage;
  const started = new Promise((resolve) => { imageStarted = resolve; });
  globalThis.Image = class {
    set src(value) {
      if (!value) return;
      pendingImage = this;
      imageStarted();
    }
  };
  globalThis.fetch = async () => { fetched = true; return jsonResponse({ items: [] }); };
  const controller = new AbortController();

  const pending = search("猫", { signal: controller.signal, retries: 0 });
  await started;
  controller.abort();

  await assert.rejects(pending, { name: "AbortError", code: "ABORTED" });
  assert.equal(fetched, false);
  // Other callers can still share this probe after one caller aborts.
  pendingImage.onerror?.();
});
