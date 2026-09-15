import test from "node:test";
import assert from "node:assert/strict";

import {
  TYPE2_STREAM_REQUEST_COOLDOWN_MS,
  claimType2StreamRequestSlot,
  resetType2StreamRequestCooldown,
} from "../src/utils/type2StreamRequestCooldown.js";

const VIDEO_A = "dQw4w9WgXcQ";
const VIDEO_B = "9bZkp7q19f0";

test("different videos still share the 30-second request cooldown", () => {
  resetType2StreamRequestCooldown();
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_000), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 1_001), TYPE2_STREAM_REQUEST_COOLDOWN_MS - 1);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 30_999), 1);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 31_000), 0);
});

test("the same video can be requested again immediately, even while another ID is waiting", () => {
  resetType2StreamRequestCooldown();
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_000), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_001), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 1_002), 29_999);
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_003), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 31_002), 1);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 31_003), 0);
});

test("after switching, only the new ID bypasses the cooldown", () => {
  resetType2StreamRequestCooldown();
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_000), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 31_000), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 31_001), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 31_002), 29_999);
});

test("reset clears both the cooldown and remembered video ID", () => {
  resetType2StreamRequestCooldown();
  claimType2StreamRequestSlot(VIDEO_A, 1_000);
  resetType2StreamRequestCooldown();
  assert.equal(claimType2StreamRequestSlot(VIDEO_B, 1_001), 0);
  assert.equal(claimType2StreamRequestSlot(VIDEO_A, 1_002), 29_999);
});
