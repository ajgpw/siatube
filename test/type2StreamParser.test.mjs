import test from "node:test";
import assert from "node:assert/strict";
import { parseStream2Response } from "../src/utils/player/type2StreamParser.js";

function browser(t, canPlayType) {
  for (const [name, value] of Object.entries({
    window: {}, document: { createElement: () => ({ canPlayType }) },
    navigator: { userAgent: "Safari" },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    t.after(() => original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]);
  }
}

const muxed = (overrides = {}) => ({
  url: "https://media.example/video.mp4", resolution: "1280x720",
  hasVideo: true, hasAudio: true, mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
  ...overrides,
});

test("a negative capability hint alone does not discard every playback URL", (t) => {
  browser(t, () => "");
  const format = Object.freeze(muxed());
  const result = parseStream2Response({ formats: [format] });
  assert.equal(result.defaultQuality, "720p");
  assert.equal(result.sources["720p"].url, format.url);
  assert.equal(result.sources["720p"].mimeType, null, "the browser inspects the resource instead of skipping the rejected type");
  assert.equal(result.muxedFallbackSources[0].mimeType, null);
});

test("supported formats stay ahead of rejected codec hints", (t) => {
  browser(t, (type) => type.includes("avc1") ? "probably" : "");
  const formats = [muxed({ resolution: "3840x2160", mimeType: 'video/mp4; codecs="av01"' }), muxed()];
  const result = parseStream2Response({ formats });
  assert.equal(result.defaultQuality, "720p");
  assert.deepEqual(result.availableQualities, ["720p"]);
  assert.equal(formats[1]._supportLevel, undefined, "capability ranking must not modify cached API data");
});

test("missing MIME information still allows the media resource to be tried", (t) => {
  browser(t, () => "");
  const result = parseStream2Response({ formats: [muxed({ mimeType: null })] });
  assert.equal(result.sources["720p"].url, "https://media.example/video.mp4");
  assert.equal(result.sources["720p"].mimeType, null);
});

test("separated AV remains available when a muxed source at the same quality fails", (t) => {
  browser(t, () => "probably");
  const result = parseStream2Response({ formats: [
    muxed(),
    muxed({ url: "https://media.example/video-only.mp4", hasAudio: false }),
    muxed({ url: "https://media.example/audio.m4a", hasVideo: false, resolution: "audio only", mimeType: "audio/mp4" }),
  ] });
  assert.equal(result.sources["720p"].url, "https://media.example/video.mp4");
  assert.equal(result.sources["720p_2"].video.url, "https://media.example/video-only.mp4");
  assert.equal(result.sources["720p_2"].audio.url, "https://media.example/audio.m4a");
});

test("a genuinely empty response still has no playback candidates", (t) => {
  browser(t, () => "probably");
  assert.deepEqual(parseStream2Response({ formats: [muxed({ url: "" })] }).sources, {});
});

test("recognized audio does not hide video whose codec hint was rejected", (t) => {
  browser(t, (type) => type === "audio/mp4" ? "probably" : "");
  const result = parseStream2Response({ formats: [
    muxed(),
    muxed({ hasVideo: false, resolution: "audio only", mimeType: "audio/mp4", url: "https://media.example/audio.m4a" }),
  ] });
  assert.equal(result.defaultQuality, "720p");
  assert.equal(result.sources["720p"].url, "https://media.example/video.mp4");
  assert.equal(result.sources["720p"].mimeType, null);
});
