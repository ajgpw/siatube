import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick, reactive } from "vue";
import { useMediaSessionMetadata } from "../src/composables/useMediaSessionMetadata.js";

function setup(t, { supported = true } = {}) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousMetadata = Object.getOwnPropertyDescriptor(globalThis, "MediaMetadata");
  const session = { metadata: null };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: supported ? { mediaSession: session } : {} });
  Object.defineProperty(globalThis, "MediaMetadata", { configurable: true, value: supported ? class {
    constructor(data) { Object.assign(this, data); }
  } : undefined });
  const scope = effectScope();
  t.after(() => {
    scope.stop();
    for (const [key, descriptor] of [["navigator", previousNavigator], ["MediaMetadata", previousMetadata]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const metadata = reactive({ videoId: "video-a", title: "曲 A", artist: "作者 A", thumbnailUrl: "https://example.com/a.jpg" });
  const controls = scope.run(() => useMediaSessionMetadata(() => ({ ...metadata })));
  return { session, scope, metadata, controls };
}

test("sets title, artist and cover and follows track and late metadata changes", async (t) => {
  const { session, metadata } = setup(t);
  assert.equal(session.metadata.title, "曲 A");
  assert.equal(session.metadata.artist, "作者 A");
  assert.deepEqual(session.metadata.artwork, [{ src: "https://example.com/a.jpg" }]);
  Object.assign(metadata, { videoId: "video-b", title: "曲 B", artist: "", thumbnailUrl: "" });
  await nextTick();
  assert.equal(session.metadata.title, "曲 B");
  assert.equal(session.metadata.artist, "");
  assert.deepEqual(session.metadata.artwork, []);
  Object.assign(metadata, { artist: "作者 B", thumbnailUrl: "https://example.com/b.webp" });
  await nextTick();
  assert.equal(session.metadata.artist, "作者 B");
  assert.deepEqual(session.metadata.artwork, [{ src: "https://example.com/b.webp" }]);
});

test("clears metadata when video is cleared or player is unmounted", async (t) => {
  const { session, scope, metadata } = setup(t);
  metadata.videoId = "";
  await nextTick();
  assert.equal(session.metadata, null);
  metadata.videoId = "video-b";
  await nextTick();
  assert.ok(session.metadata);
  scope.stop();
  assert.equal(session.metadata, null);
});

test("cleanup does not erase another player's metadata", (t) => {
  const { session, scope } = setup(t);
  const other = new MediaMetadata({ title: "別のプレイヤー" });
  session.metadata = other;
  scope.stop();
  assert.equal(session.metadata, other);
});

test("unsupported browsers can still mount and play", (t) => {
  const { controls, scope } = setup(t, { supported: false });
  assert.doesNotThrow(() => controls.updateMetadata());
  assert.doesNotThrow(() => scope.stop());
});

test("invalid artwork does not prevent title and artist updates", async (t) => {
  const { session, metadata, controls } = setup(t);
  metadata.thumbnailUrl = "https://[invalid";
  await nextTick();
  assert.equal(session.metadata.title, "曲 A");
  assert.equal(session.metadata.artist, "作者 A");
  assert.deepEqual(session.metadata.artwork, []);
  session.metadata = null;
  controls.updateMetadata();
  assert.equal(session.metadata.title, "曲 A");
});
