import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAutoplay,
  loadAmbientLight,
  saveAmbientLight,
  AMBIENT_LIGHT_SETTING_EVENT,
  AMBIENT_LIGHT_STORAGE_KEY,
  loadDefaultPlayback,
  saveDefaultPlayback,
} from "../src/services/storage/settingsManager.js";

test("自動再生は未設定の場合オンになる", () => {
  globalThis.localStorage = {
    getItem: () => null,
  };

  assert.equal(loadAutoplay(), true);
});

test("明示的にオフへ設定した値は維持する", () => {
  globalThis.localStorage = {
    getItem: () => "0",
  };

  assert.equal(loadAutoplay(), false);
});

test("アンビエントライトは未設定の場合オンになる", (t) => {
  const previousStorage = globalThis.localStorage;
  t.after(() => { globalThis.localStorage = previousStorage; });
  globalThis.localStorage = { getItem: () => null };

  assert.equal(loadAmbientLight(), true);
});

test("アンビエントライトの保存済み設定を読み込み、オフを維持する", (t) => {
  const previousStorage = globalThis.localStorage;
  t.after(() => { globalThis.localStorage = previousStorage; });

  for (const [stored, expected] of [
    ['0', false], ['false', false], ['"0"', false],
    ['1', true], ['true', true], ['"1"', true],
  ]) {
    globalThis.localStorage = {
      getItem: (key) => {
        assert.equal(key, AMBIENT_LIGHT_STORAGE_KEY);
        return stored;
      },
    };
    assert.equal(loadAmbientLight(), expected);
  }
});

test("アンビエントライトの切り替えを保存し、同じタブに即時通知する", (t) => {
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  t.after(() => {
    globalThis.localStorage = previousStorage;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  });

  const values = new Map();
  const events = [];
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.window = { dispatchEvent: (event) => events.push(event) };
  globalThis.CustomEvent = class {
    constructor(type, options) {
      this.type = type;
      this.detail = options.detail;
    }
  };

  saveAmbientLight(false);
  assert.equal(values.get(AMBIENT_LIGHT_STORAGE_KEY), '0');
  assert.equal(loadAmbientLight(), false);
  assert.equal(events[0].type, AMBIENT_LIGHT_SETTING_EVENT);
  assert.deepEqual(events[0].detail, { enabled: false });

  saveAmbientLight(true);
  assert.equal(values.get(AMBIENT_LIGHT_STORAGE_KEY), '1');
  assert.equal(loadAmbientLight(), true);
  assert.deepEqual(events[1].detail, { enabled: true });
});

test("再生方式は旧形式・JSON 形式のどちらも同じ値で読み込む", (t) => {
  const previousStorage = globalThis.localStorage;
  t.after(() => { globalThis.localStorage = previousStorage; });

  for (const stored of ['2', '"2"', '3', '"3"']) {
    globalThis.localStorage = { getItem: () => stored };
    assert.equal(loadDefaultPlayback(), stored.includes('2') ? '2' : '3');
  }
});

test("再生方式の保存と Cookie からの移行に共通設定を使う", (t) => {
  const previousStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  t.after(() => {
    globalThis.localStorage = previousStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.document = { cookie: 'StreamType=2' };

  assert.equal(loadDefaultPlayback(), '2');
  assert.equal(values.get('defaultPlaybackMode'), '"2"');

  saveDefaultPlayback('3');
  assert.equal(loadDefaultPlayback(), '3');
  assert.match(document.cookie, /^StreamType=3;/);
});
