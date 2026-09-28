import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAutoplay,
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
