import test from "node:test";
import assert from "node:assert/strict";

import {
  getAutoplayCandidateId,
  pushToAutoplayHistory,
} from "../src/utils/player/autoplayManager.js";

function installBrowserMocks(items = []) {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  globalThis.window = {
    __autoplayDurationFilter: { enabled: true, maxSeconds: 240 },
  };
  globalThis.document = {
    querySelectorAll: () => items.map(({ id, duration }) => ({
      getAttribute: (name) => name === "data-video-id" ? id : duration,
    })),
  };
}

test("自動再生履歴と時間フィルタを考慮して候補を選ぶ", () => {
  installBrowserMocks([
    { id: "current", duration: "30" },
    { id: "long-video", duration: "300" },
    { id: "short-video", duration: "180" },
  ]);
  pushToAutoplayHistory("already-played");

  assert.equal(getAutoplayCandidateId("current"), "short-video");
});

test("候補がフィルタ条件を満たさない場合に通知する", () => {
  installBrowserMocks([{ id: "long-video", duration: "300" }]);
  let notified = false;

  const candidate = getAutoplayCandidateId("current", {
    onNoSuitableVideo: () => {
      notified = true;
    },
  });

  assert.equal(candidate, null);
  assert.equal(notified, true);
});
