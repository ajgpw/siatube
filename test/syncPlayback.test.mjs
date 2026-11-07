import { test } from "node:test";
import assert from "node:assert/strict";
import { createSyncPlayback } from "../src/utils/player/syncPlayback.js";

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class Media extends EventTarget {
  constructor() {
    super();
    Object.assign(this, { readyState: 3, paused: true, seeking: false, duration: 120,
      playbackRate: 1, volume: 0.8, muted: false, plays: 0, children: [], seeks: [] });
    this.time = 0;
  }
  get currentTime() { return this.time; }
  set currentTime(time) {
    this.time = time;
    this.seeks.push(time);
    this.seeking = true;
    queueMicrotask(() => {
      this.dispatchEvent(new Event("seeking"));
      queueMicrotask(() => {
        this.seeking = false;
        this.dispatchEvent(new Event("seeked"));
      });
    });
  }
  play() {
    this.plays++;
    if (this.paused) {
      this.paused = false;
      queueMicrotask(() => this.dispatchEvent(new Event("play")));
    }
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    queueMicrotask(() => this.dispatchEvent(new Event("pause")));
  }
  querySelectorAll() { return this.children.slice(); }
  removeAttribute() {}
  appendChild(source) {
    source.remove = () => { this.children = this.children.filter((item) => item !== source); };
    this.children.push(source);
  }
  load() {}
}

function harness(t, options = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 10_000 });
  t.mock.method(performance, "now", () => Date.now());
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({}) } });
  const video = new Media(), audio = new Media();
  const errors = [], drifts = [];
  const controller = createSyncPlayback({ video, audio,
    videoSources: [{ url: "video.mp4" }], audioSources: { url: "audio.m4a" },
    onDrift: (diff) => drifts.push(diff), onPlayError: (error) => errors.push(error), ...options });
  t.after(() => {
    controller.dispose();
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  });
  return { video, audio, controller, errors, drifts };
}

test("starts both elements in the same task even while the first play promise is pending", async (t) => {
  const { video, audio, controller } = harness(t);
  let resolve;
  video.play = () => { video.plays++; video.paused = false; return new Promise((r) => { resolve = r; }); };
  controller.play();
  assert.equal(video.plays, 1);
  assert.equal(audio.plays, 1);
  controller.play();
  assert.equal(video.plays, 1);
  resolve();
  await flush();
});

for (const which of ["video", "audio"]) {
  test(`${which} buffering holds its peer and resumes without losing play intent`, async (t) => {
    const { video, audio, controller } = harness(t);
    controller.play();
    await flush();
    const stalled = which === "video" ? video : audio;
    const peer = which === "video" ? audio : video;
    stalled.readyState = 2;
    stalled.dispatchEvent(new Event("waiting"));
    await flush();
    assert.equal(peer.paused, true);
    assert.equal(controller.wantsPlay, true);
    stalled.readyState = 3;
    stalled.dispatchEvent(new Event("canplay"));
    await flush();
    assert.equal(video.paused, false);
    assert.equal(audio.paused, false);
  });
}

test("user pause while buffering prevents all later readiness and timer resumes", async (t) => {
  const { video, audio, controller } = harness(t);
  controller.play();
  await flush();
  video.readyState = 2;
  video.dispatchEvent(new Event("waiting"));
  video.pause();
  await flush();
  video.readyState = 4;
  video.dispatchEvent(new Event("canplay"));
  audio.dispatchEvent(new Event("progress"));
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(controller.wantsPlay, false);
  assert.equal(audio.paused, true);
  assert.equal(video.paused, true);
});

test("small drift adjusts only the video within four percent, at every selected speed", async (t) => {
  const { video, audio, controller } = harness(t);
  controller.play();
  await flush();
  for (const rate of [0.25, 1, 2, 4]) {
    controller.setPlaybackRate(rate);
    for (const diff of [-0.3, 0.3, 0.01]) {
      video.time = 10 + diff;
      audio.time = 10;
      t.mock.timers.tick(100);
      assert.equal(audio.playbackRate, rate);
      assert.ok(video.playbackRate >= rate * 0.96 && video.playbackRate <= rate * 1.04);
      if (diff > 0.04) assert.ok(video.playbackRate < rate);
      else if (diff < -0.04) assert.ok(video.playbackRate > rate);
      else assert.equal(video.playbackRate, rate);
    }
  }
  assert.deepEqual(audio.seeks, []);
});

test("sustained large drift seeks the video and never jumps the audio", async (t) => {
  const { video, audio, controller } = harness(t);
  controller.play();
  await flush();
  video.time = 12;
  audio.time = 10;
  for (let i = 0; i < 4; i++) { t.mock.timers.tick(100); await flush(); }
  assert.deepEqual(video.seeks, [10]);
  assert.deepEqual(audio.seeks, []);
  assert.equal(audio.currentTime, 10);
});

test("rapid user seeks use the latest position and preserve a paused state", async (t) => {
  const { video, audio, controller } = harness(t);
  video.currentTime = 20;
  video.currentTime = 60;
  await flush();
  assert.equal(audio.currentTime, 60);
  assert.equal(audio.plays, 0);
  assert.equal(controller.wantsPlay, false);
  controller.play();
  await flush();
  video.currentTime = 90;
  await flush();
  assert.equal(audio.currentTime, 90);
  assert.equal(video.paused, false);
  assert.equal(audio.paused, false);
});

test("quality position restores once per element on metadata, without a later rewind", async (t) => {
  const { video, audio } = harness(t, { initialTime: 40 });
  video.readyState = audio.readyState = 0;
  video.readyState = 1;
  video.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(video.currentTime, 40);
  assert.equal(audio.currentTime, 0);
  audio.readyState = 1;
  audio.dispatchEvent(new Event("loadedmetadata"));
  await flush();
  assert.equal(audio.currentTime, 40);
  video.time = audio.time = 42;
  t.mock.timers.tick(2000);
  video.dispatchEvent(new Event("canplay"));
  assert.equal(video.currentTime, 42);
  assert.deepEqual(video.seeks, [40]);
  assert.deepEqual(audio.seeks, [40]);
});

test("autoplay denial stops both and requires a fresh user play request", async (t) => {
  const { video, audio, controller, errors } = harness(t);
  audio.play = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  controller.play();
  await flush();
  assert.equal(errors[0].name, "NotAllowedError");
  assert.equal(video.paused, true);
  assert.equal(controller.wantsPlay, false);
  t.mock.timers.tick(5000);
  assert.equal(video.plays, 1);
});

test("late rejection after pause or disposal cannot affect a newer playback request", async (t) => {
  const { video, audio, controller, errors } = harness(t);
  let reject;
  video.play = () => { video.paused = false; return new Promise((_, r) => { reject = r; }); };
  controller.play();
  controller.pause();
  await flush();
  video.play = Media.prototype.play;
  controller.play();
  await flush();
  reject(new DOMException("old rejection", "NotAllowedError"));
  await flush();
  assert.equal(controller.wantsPlay, true);
  assert.equal(audio.paused, false);
  assert.deepEqual(errors, []);
  controller.dispose();
  const plays = audio.plays;
  video.dispatchEvent(new Event("play"));
  audio.dispatchEvent(new Event("canplay"));
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(audio.plays, plays);
});

test("video volume and native loop seeks control the auxiliary audio", async (t) => {
  const { video, audio, controller } = harness(t);
  video.volume = 0.3;
  video.muted = true;
  video.dispatchEvent(new Event("volumechange"));
  assert.equal(audio.volume, 0.3);
  assert.equal(audio.muted, true);
  video.loop = true;
  controller.play();
  await flush();
  video.time = audio.time = 119;
  video.currentTime = 0;
  await flush();
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.loop, false);
  assert.equal(controller.wantsPlay, true);
});


test("a slightly shorter audio track neither restarts nor prevents video completion", async (t) => {
  const { video, audio, controller } = harness(t);
  controller.play();
  await flush();
  video.time = 119.9;
  audio.time = 120;
  audio.ended = true;
  audio.paused = true;
  audio.dispatchEvent(new Event("pause"));
  audio.dispatchEvent(new Event("ended"));
  t.mock.timers.tick(100);
  assert.equal(controller.wantsPlay, true);
  assert.equal(video.paused, false);
  assert.equal(audio.plays, 1);
  assert.deepEqual(video.seeks, []);
  video.ended = true;
  video.dispatchEvent(new Event("ended"));
  assert.equal(controller.wantsPlay, false);
});

test("playback intent changes cancel stale autoplay scheduling", async (t) => {
  const intents = [];
  const { video, controller } = harness(t, { onPlaybackIntent: (playing) => intents.push(playing) });
  controller.play();
  controller.play();
  await flush();
  video.pause();
  await flush();
  assert.deepEqual(intents, [true, false]);
});


test("a timeupdate before the queued user pause event cannot restart playback", async (t) => {
  const { video, audio, controller } = harness(t);
  controller.play();
  await flush();
  video.pause();
  // Real browsers queue timeupdate before pause; timers can also observe .paused first.
  video.dispatchEvent(new Event("timeupdate"));
  t.mock.timers.tick(100);
  await flush();
  assert.equal(video.paused, true);
  assert.equal(audio.paused, true);
  assert.equal(controller.wantsPlay, false);
  assert.equal(video.plays, 1);
});
