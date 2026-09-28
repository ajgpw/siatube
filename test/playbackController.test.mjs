import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackController } from "../src/utils/player/playbackController.js";

function media() {
  return Object.assign(new EventTarget(), {
    paused: true, currentTime: 0, plays: 0,
    buffered: { length: 1, start: () => 0, end: () => 10 },
    play() { this.plays++; return Promise.resolve(); },
  });
}

function harness(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = new EventTarget();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const videoRef = { value: media() }, audioRef = { value: null };
  let monitored = 0;
  const controller = createPlaybackController({
    videoRef, audioRef,
    autoplayEnabled: { value: true }, repeatEnabled: { value: true },
    settingsVisible: { value: false }, showUnmutePrompt: { value: false },
    isCurrentlyUsingM3u8: () => true,
    startM3u8LoadTimeout: () => monitored++, clearM3u8LoadTimeout() {},
  });
  t.after(() => {
    controller.dispose();
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
  return { controller, videoRef, getMonitored: () => monitored };
}

test("buffer listeners detach from the media they were bound to after ref replacement", (t) => {
  const { controller, videoRef, getMonitored } = harness(t);
  const old = videoRef.value;
  controller.attachBufferListeners();
  videoRef.value = media();
  controller.detachBufferListeners();
  old.dispatchEvent(new Event("waiting"));
  assert.equal(getMonitored(), 0);
  controller.attachBufferListeners();
  videoRef.value.dispatchEvent(new Event("waiting"));
  assert.equal(getMonitored(), 1);
});

test("reset cancels a previous video's autoplay and loop-resume timers", (t) => {
  const { controller, videoRef } = harness(t);
  controller.scheduleAutoplay();
  controller.onTimeUpdateLoopHandler();
  videoRef.value = media();
  controller.reset();
  t.mock.timers.tick(6_000);
  assert.equal(videoRef.value.plays, 0);
});

test("scheduled autoplay handles a browser policy rejection without an unhandled promise", async (t) => {
  const { controller, videoRef } = harness(t);
  let attempts = 0;
  videoRef.value.play = () => {
    attempts++;
    return Promise.reject(new DOMException("autoplay denied", "NotAllowedError"));
  };
  controller.scheduleAutoplay();
  t.mock.timers.tick(3_000);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
});
