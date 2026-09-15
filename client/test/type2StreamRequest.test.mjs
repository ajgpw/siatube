import test from "node:test";
import assert from "node:assert/strict";
import { createType2StreamRequest } from "../src/utils/type2StreamRequest.js";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(overrides = {}) {
  const states = [], responses = [], errors = [], calls = [];
  const request = createType2StreamRequest({
    claimSlot: () => 0,
    fetchStream: async (id, options) => { calls.push({ id, options }); return { id }; },
    onState: (state) => states.push(state.phase),
    onResponse: (data) => responses.push(data),
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return { request, states, responses, errors, calls };
}

test("cooldown is displayed separately and dispatches the API when the slot opens", async () => {
  const slot = deferred();
  let claims = 0;
  const h = harness({ claimSlot: () => claims++ === 0 ? 30_000 : 0, wait: () => slot.promise });
  const pending = h.request.load("video-a");
  assert.equal(h.states.at(-1), "cooldown");
  assert.equal(h.calls.length, 0);
  assert.equal(h.request.load("video-a", true), pending);
  slot.resolve();
  await pending;
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.states, ["idle", "cooldown", "requesting", "preparing", "ready"]);
  assert.deepEqual(h.responses, [{ id: "video-a" }]);
});

test("a slow response survives repeated reloads instead of being cancelled every four seconds", async () => {
  const response = deferred();
  let calls = 0, signal;
  const h = harness({ fetchStream: (_, options) => { calls++; signal = options.signal; return response.promise; } });
  const pending = h.request.load("video-a");
  for (let i = 0; i < 10; i++) assert.equal(h.request.load("video-a", true), pending);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, false);
  assert.equal(h.states.at(-1), "requesting");
  response.resolve({ url: "https://example.com/video.mp4" });
  await pending;
  assert.equal(h.responses.length, 1);
  assert.equal(h.states.at(-1), "ready");
});

test("late success or failure from a previous video cannot overwrite the new video", async () => {
  for (const fail of [false, true]) {
    const old = deferred();
    let oldSignal;
    const h = harness({ fetchStream: (id, options) => {
      if (id === "old") { oldSignal = options.signal; return old.promise; }
      return Promise.resolve({ id });
    } });
    const pending = h.request.load("old");
    await h.request.load("new");
    assert.equal(oldSignal.aborted, true);
    if (fail) old.reject(new Error("late failure"));
    else old.resolve({ id: "old" });
    await pending;
    assert.deepEqual(h.responses, [{ id: "new" }]);
    assert.deepEqual(h.errors, []);
    assert.equal(h.states.at(-1), "ready");
  }
});

test("switching videos during cooldown never dispatches the old video", async () => {
  const slot = deferred();
  let claims = 0;
  const h = harness({ claimSlot: () => claims++ === 0 ? 30_000 : 0, wait: () => slot.promise });
  const pending = h.request.load("old");
  await h.request.load("new");
  slot.resolve();
  await pending;
  assert.deepEqual(h.calls.map(({ id }) => id), ["new"]);
});

test("dispose cancels the real cooldown timer and prevents dispatch", async () => {
  const h = harness({ claimSlot: () => 30_000 });
  const pending = h.request.load("video-a");
  h.request.dispose();
  await pending;
  await h.request.load("video-b");
  assert.equal(h.calls.length, 0);
  assert.equal(h.states.at(-1), "idle");
});

test("dispose while receiving a response prevents rendering", async () => {
  const response = deferred();
  const h = harness({ fetchStream: () => response.promise });
  const pending = h.request.load("video-a");
  h.request.dispose();
  response.resolve({ id: "video-a" });
  await pending;
  assert.deepEqual(h.responses, []);
  assert.equal(h.states.at(-1), "idle");
});

test("API or response preparation errors end loading and allow a manual retry", async () => {
  for (const source of ["api", "render"]) {
    let fail = true;
    const error = new Error("unavailable");
    const h = harness({
      fetchStream: async () => { if (fail && source === "api") throw error; return {}; },
      onResponse: () => { if (fail && source === "render") throw error; },
    });
    await h.request.load("video-a");
    assert.deepEqual(h.errors, [error]);
    assert.equal(h.states.at(-1), "error");
    fail = false;
    await h.request.load("video-a", true);
    assert.equal(h.states.at(-1), "ready");
  }
});

test("an old render continuation cannot mark a newer request ready", async () => {
  const render = deferred(), response = deferred();
  const h = harness({
    fetchStream: (id) => id === "new" ? response.promise : Promise.resolve({ id }),
    onResponse: () => render.promise,
  });
  const old = h.request.load("old");
  await Promise.resolve();
  assert.equal(h.states.at(-1), "preparing");
  const current = h.request.load("new");
  render.resolve();
  await old;
  assert.equal(h.states.at(-1), "requesting");
  response.resolve({ id: "new" });
  await current;
  assert.equal(h.states.at(-1), "ready");
});

test("request dispatch passes the video ID to the cooldown for initial load and reload", async () => {
  const ids = [];
  const h = harness({ claimSlot: (id) => { ids.push(id); return 0; } });
  await h.request.load("video-a");
  await h.request.load("video-a", true);
  await h.request.load("video-b");
  assert.deepEqual(ids, ["video-a", "video-a", "video-b"]);
  assert.equal(h.calls[1].options.forceRefresh, true);
});
