import test from "node:test";
import assert from "node:assert/strict";
import {
  __resetThumbnailSourceForTests,
  isThumbnailProxyAvailable,
  normalizeThumbnailPayload,
  resolveThumbnailSource,
  selectThumbnailMode,
  thumbnailForStorage,
} from "../src/services/network/thumbnailSource.js";
import {
  __resetGuardSessionForTests,
  saveGuardSession,
} from "../src/services/guard/guard-session.js";

const ID = "dQw4w9WgXcQ";
const OTHER_ID = "OHAjc-ayhus";
const SID = "S".repeat(43);
const DATA = "data:image/jpeg;base64,AAEC";

function session(sessionId = SID, verifiedUntil = Date.now() + 60_000) {
  saveGuardSession({ version: 1, sessionId, expiresAt: Date.now() + 120_000, verifiedUntil });
}

function setup(t, imageLoad = () => true) {
  const originals = { Image: globalThis.Image, localStorage: globalThis.localStorage };
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  __resetGuardSessionForTests();
  __resetThumbnailSourceForTests();
  const images = [];
  globalThis.Image = class {
    set src(value) {
      this.url = value;
      images.push(this);
      const available = imageLoad(new URL(value));
      if (available === null) return;
      this.naturalWidth = available ? 120 : 0;
      this.naturalHeight = available ? 90 : 0;
      queueMicrotask(() => available ? this.onload?.() : this.onerror?.());
    }
  };
  t.after(() => {
    __resetThumbnailSourceForTests();
    __resetGuardSessionForTests();
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return images;
}

test("concurrent selections share an image probe and prefer YouTube without CORS", async (t) => {
  const images = setup(t);
  assert.deepEqual(await Promise.all([selectThumbnailMode(), selectThumbnailMode()]), ["youtube", "youtube"]);
  assert.equal(await selectThumbnailMode(), "youtube");
  assert.equal(images.length, 1);
  assert.equal(images[0].referrerPolicy, "no-referrer");
  assert.equal(images[0].crossOrigin, undefined);
  assert.equal(resolveThumbnailSource(ID), `https://img.youtube.com/vi/${ID}/sddefault.jpg`);
});

test("proxy probes require a verified session and use renewed session IDs", async (t) => {
  const images = setup(t, (url) => url.hostname === "siatube-web.online");
  assert.equal(await isThumbnailProxyAvailable(), false);
  session(SID, Date.now() - 1);
  assert.equal(await isThumbnailProxyAvailable(), false);
  assert.equal(images.length, 0);
  assert.equal(resolveThumbnailSource(ID, "url"), "");

  session();
  assert.equal(await selectThumbnailMode(), "url");
  const first = new URL(resolveThumbnailSource(ID));
  assert.equal(first.searchParams.get("guard_sid"), SID);
  const replacement = "R".repeat(43);
  session(replacement);
  assert.equal(await isThumbnailProxyAvailable(), true);
  const renewed = new URL(resolveThumbnailSource(first.toString()));
  assert.equal(renewed.searchParams.get("guard_sid"), replacement);
  assert.equal(images.filter((img) => new URL(img.url).hostname === "siatube-web.online").length, 2);
});

test("blocked image routes are cached briefly and retried after network recovery", async (t) => {
  let now = Date.now();
  let youtubeAvailable = false;
  const images = setup(t, (url) => url.hostname === "img.youtube.com" && youtubeAvailable);
  const originalNow = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  session(SID, now + 120_000);
  assert.equal(await selectThumbnailMode(), "txt");
  assert.equal(await selectThumbnailMode(), "txt");
  assert.equal(images.length, 2);
  youtubeAvailable = true;
  now += 30_001;
  assert.equal(await selectThumbnailMode(), "youtube");
  assert.equal(images.length, 3);
});

test("an aborted subscriber leaves the shared detection available to other requests", async (t) => {
  const images = setup(t, () => null);
  const controller = new AbortController();
  const cancelled = selectThumbnailMode({ signal: controller.signal });
  const active = selectThumbnailMode();
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError", code: "ABORTED" });
  images[0].naturalWidth = 120;
  images[0].naturalHeight = 90;
  images[0].onload();
  assert.equal(await active, "youtube");
  assert.equal(images.length, 1);
});

test("a hanging image probe times out and falls back to base64", async (t) => {
  setup(t, () => null);
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalTimeout(callback, 0);
  t.after(() => { globalThis.setTimeout = originalTimeout; });
  session();
  assert.equal(await selectThumbnailMode(), "txt");
});

test("non-browser callers select base64 without making image probes", async (t) => {
  const images = setup(t);
  delete globalThis.Image;
  assert.equal(await selectThumbnailMode(), "txt");
  assert.equal(images.length, 0);
  assert.equal(resolveThumbnailSource("AAEC"), DATA);
});

test("thumbnail normalization covers nested page and continuation shapes without rewriting icons or links", (t) => {
  setup(t);
  session();
  const payload = {
    thumbnail: ID,
    url: ID,
    avatar: ID,
    channelIcons: [{ url: ID }],
    "Related-videos": { relatedVideos: [{ thumbnail: OTHER_ID }], nextContinuationToken: ID },
    topVideo: { thumbnailUrl: ID },
    sections: [{ items: [{ thumbnails: [{ width: 320, url: ID }], icon: ID }] }],
    playlists: [{ items: [{ thumbnail: OTHER_ID }] }],
    posts: [{ attachment: { thumbnail: ID, images: [{ url: ID }] } }],
    live: [{ thumbnail: ID }],
    shorts: [{ thumbnail: OTHER_ID }],
    items: [{ thumbnails: ID }],
  };
  const normalized = normalizeThumbnailPayload(payload, { mode: "url" });
  const thumbnail = (id) => `https://siatube-web.online/?token=${id}&guard_sid=${SID}`;
  assert.equal(normalized.thumbnail, thumbnail(ID));
  assert.equal(normalized["Related-videos"].relatedVideos[0].thumbnail, thumbnail(OTHER_ID));
  assert.equal(normalized["Related-videos"].nextContinuationToken, ID);
  assert.equal(normalized.topVideo.thumbnailUrl, thumbnail(ID));
  assert.deepEqual(normalized.sections[0].items[0].thumbnails, [{ width: 320, url: thumbnail(ID) }]);
  assert.equal(normalized.playlists[0].items[0].thumbnail, thumbnail(OTHER_ID));
  assert.equal(normalized.posts[0].attachment.thumbnail, thumbnail(ID));
  assert.equal(normalized.live[0].thumbnail, thumbnail(ID));
  assert.equal(normalized.shorts[0].thumbnail, thumbnail(OTHER_ID));
  assert.deepEqual(normalized.items[0].thumbnails, [{ url: thumbnail(ID) }]);
  assert.equal(normalized.url, ID);
  assert.equal(normalized.avatar, ID);
  assert.equal(normalized.sections[0].items[0].icon, ID);
  assert.deepEqual(normalized.channelIcons, [{ url: ID }]);
  assert.deepEqual(normalized.posts[0].attachment.images, [{ url: ID }]);
  assert.equal(payload.thumbnail, ID);
});

test("data URLs, raw base64, thumbnail dictionaries and YouTube host variants remain displayable", (t) => {
  setup(t);
  const payload = {
    thumbnail: "AAEC",
    items: [
      { thumbnail: DATA },
      { thumbnails: { medium: { width: 320, url: `https://i.ytimg.com/vi/${ID}/mqdefault.jpg` } } },
      { thumbnails: [ID, { url: `https://img.youtube.com/vi/${OTHER_ID}/hqdefault.jpg` }] },
    ],
  };
  const normalized = normalizeThumbnailPayload(payload, { mode: "youtube" });
  assert.equal(normalized.thumbnail, DATA);
  assert.equal(normalized.items[0].thumbnail, DATA);
  assert.equal(normalized.items[1].thumbnails.medium.url, `https://img.youtube.com/vi/${ID}/mqdefault.jpg`);
  assert.deepEqual(normalized.items[2].thumbnails, [
    { url: `https://img.youtube.com/vi/${ID}/sddefault.jpg` },
    { url: `https://img.youtube.com/vi/${OTHER_ID}/hqdefault.jpg` },
  ]);
});

test("persistent thumbnail references exclude session IDs", (t) => {
  setup(t);
  session();
  const proxy = resolveThumbnailSource(ID, "url");
  assert.equal(thumbnailForStorage(proxy), ID);
  assert.equal(thumbnailForStorage(DATA), DATA);
  assert.equal(thumbnailForStorage(ID), ID);
  assert.equal(thumbnailForStorage("https://image.example/image.jpg?guard_sid=secret&size=320"),
    "https://image.example/image.jpg?size=320");
});
