import test from "node:test";
import assert from "node:assert/strict";

import {
  estimateStreamWaitMs,
  normalizeStreamStatus,
} from "../src/utils/player/streamStatus.js";

test("wait estimate uses the current video's position and longest duration", () => {
  const status = {
    status: "ok",
    processing: {
      count: 2,
      ids: ["firstVideo1", "myVideoId01"],
      longest: {
        videoid: "firstVideo1",
        durationMs: 2_000,
      },
    },
  };

  assert.equal(estimateStreamWaitMs(status, "myVideoId01"), 8_000);
  assert.equal(estimateStreamWaitMs(status, "firstVideo1"), 3_000);
});

test("wait estimate includes queued work and the requested video's own work", () => {
  const status = {
    status: "ok",
    processing: {
      count: 2,
      ids: ["firstVideo1", "otherVideo1"],
      longest: {
        videoid: "firstVideo1",
        durationMs: 2_000,
      },
    },
  };

  assert.equal(estimateStreamWaitMs(status, "myVideoId01"), 13_000);
  assert.equal(
    estimateStreamWaitMs({ status: "ok", processing: { count: 0, ids: [] } }, "myVideoId01"),
    5_000,
  );
});

test("status normalization tolerates incomplete responses", () => {
  assert.deepEqual(normalizeStreamStatus({}), {
    status: "unknown",
    generatedAt: "",
    processing: {
      count: 0,
      ids: [],
      longest: null,
    },
  });
});
