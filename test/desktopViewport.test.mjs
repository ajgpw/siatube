import { test } from "node:test";
import assert from "node:assert/strict";
import { effectScope } from "vue";
import { useDesktopViewport } from "../src/composables/useDesktopViewport.js";

class TrackedEvents extends EventTarget {
  listeners = new Map();
  addEventListener(type, callback, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
    super.addEventListener(type, callback, options);
  }
  removeEventListener(type, callback, options) {
    this.listeners.get(type)?.delete(callback);
    super.removeEventListener(type, callback, options);
  }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}

function installBrowser(t, { width, legacy = false, matchMedia = true }) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = Object.assign(new TrackedEvents(), { innerWidth: width });
  const query = Object.assign(new TrackedEvents(), { matches: width >= 1000 });
  const legacyListeners = new Set();
  if (legacy) {
    query.addEventListener = undefined;
    query.removeEventListener = undefined;
    query.addListener = (callback) => legacyListeners.add(callback);
    query.removeListener = (callback) => legacyListeners.delete(callback);
  }
  if (matchMedia) {
    browser.matchMedia = (media) => {
      assert.equal(media, "(min-width: 1000px)");
      return query;
    };
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true, writable: true, value: browser,
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
  function resize(nextWidth) {
    browser.innerWidth = nextWidth;
    query.matches = nextWidth >= 1000;
    if (legacy) {
      for (const callback of legacyListeners) callback(query);
    } else {
      query.dispatchEvent(new Event("change"));
    }
    browser.dispatchEvent(new Event("resize"));
  }
  return { browser, query, legacyListeners, resize };
}

function mountViewport(t) {
  const scope = effectScope();
  const state = scope.run(useDesktopViewport);
  t.after(() => scope.stop());
  return { state, unmount: () => scope.stop() };
}

test("viewport gating initializes below the desktop cutoff before rendering", (t) => {
  installBrowser(t, { width: 999.5 });
  const { state } = mountViewport(t);
  assert.equal(state.isDesktopViewport.value, false);
});

test("1000px initializes as desktop and viewport changes update the gate", (t) => {
  const { browser, query, resize } = installBrowser(t, { width: 1000 });
  const { state, unmount } = mountViewport(t);
  assert.equal(state.isDesktopViewport.value, true);
  assert.equal(query.listenerCount("change"), 1);
  assert.equal(browser.listenerCount("resize"), 0);
  resize(999.5);
  assert.equal(state.isDesktopViewport.value, false);
  resize(1280);
  assert.equal(state.isDesktopViewport.value, true);
  unmount();
  assert.equal(query.listenerCount("change"), 0);
  resize(390);
  assert.equal(state.isDesktopViewport.value, true, "disposed state stops responding");
});

test("legacy media query listeners update and are released on unmount", (t) => {
  const { legacyListeners, resize } = installBrowser(t, { width: 390, legacy: true });
  const { state, unmount } = mountViewport(t);
  assert.equal(state.isDesktopViewport.value, false);
  assert.equal(legacyListeners.size, 1);
  resize(1000);
  assert.equal(state.isDesktopViewport.value, true);
  unmount();
  assert.equal(legacyListeners.size, 0);
  resize(800);
  assert.equal(state.isDesktopViewport.value, true);
});

test("the resize fallback preserves the cutoff and removes its listener", (t) => {
  const { browser, resize } = installBrowser(t, { width: 999.5, matchMedia: false });
  const { state, unmount } = mountViewport(t);
  assert.equal(state.isDesktopViewport.value, false);
  assert.equal(browser.listenerCount("resize"), 1);
  resize(1000);
  assert.equal(state.isDesktopViewport.value, true);
  resize(999.5);
  assert.equal(state.isDesktopViewport.value, false);
  unmount();
  assert.equal(browser.listenerCount("resize"), 0);
  resize(1400);
  assert.equal(state.isDesktopViewport.value, false);
});
