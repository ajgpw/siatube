import test from "node:test";
import assert from "node:assert/strict";

import {
  clearStreamCache,
  comments,
  isVideoStreamError,
  playlist,
  search,
  stream,
  streamStatus,
  suggest,
  video,
} from "../src/services/api/siatubeApi.js";
import {
  REQUEST_PROXY_FAILURE_KEY,
  REQUEST_PROXY_HEALTH_KEY,
} from "../src/services/network/requestProxy.js";

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "content-type": "application/json" },
  });
}

test("resource helpers generate the documented paths and query parameters", async (t) => {
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    return jsonResponse({ items: [] });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await search({ q: "猫", token: "next" });
  await suggest("猫");
  await video("dQw4w9WgXcQ", { depth: 2, token: "related" });
  await comments("dQw4w9WgXcQ", { sort: "new", continuation: "comments" });
  await playlist("UUone====PLtwo", { token: "playlist", v: "dQw4w9WgXcQ" });

  assert.equal(urls[0].pathname, "/api/search");
  assert.equal(urls[0].searchParams.get("q"), "猫");
  assert.equal(urls[1].pathname, "/api/suggest/");
  assert.equal(
    decodeURIComponent(urls[2].pathname),
    "/api/video/dQw4w9WgXcQ====token==i==related==p==depth==i==2"
  );
  assert.equal(urls[3].pathname, "/api/comments");
  assert.equal(urls[3].searchParams.get("sort"), "new");
  assert.equal(urls[3].searchParams.get("continuation"), "comments");
  assert.equal(decodeURIComponent(urls[4].pathname), "/api/playlist/UUone====PLtwo");
});

test("same-video stream requests share one in-flight API call and cache", async (t) => {
  clearStreamCache();
  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    await Promise.resolve();
    return jsonResponse({ streams: { muxed: [] } });
  };
  t.after(() => {
    clearStreamCache();
    globalThis.fetch = originalFetch;
  });

  const [first, second] = await Promise.all([
    stream("dQw4w9WgXcQ"),
    stream("dQw4w9WgXcQ"),
  ]);
  const third = await stream("dQw4w9WgXcQ");

  assert.equal(calls, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
});

test("stream appends the requested origin query parameter", async (t) => {
  clearStreamCache();
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse({ streams: { muxed: [] } });
  };
  t.after(() => {
    clearStreamCache();
    globalThis.fetch = originalFetch;
  });

  await stream("dQw4w9WgXcQ", { origin: "siatube" });

  const url = new URL(requestedUrl);
  assert.equal(url.pathname, "/api/stream/dQw4w9WgXcQ");
  assert.equal(url.search, "?origin=siatube");
});

test("streamStatus uses the status endpoint and disables caching", async (t) => {
  const originalFetch = globalThis.fetch;
  let request = null;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return jsonResponse({
      status: "ok",
      processing: { count: 0, ids: [], longest: null },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await streamStatus({ retries: 0 });

  assert.equal(new URL(request.url).pathname, "/api/stream/status");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.headers["Cache-Control"], undefined);
});

test("stream exposes documented video errors by code without retrying", async (t) => {
  clearStreamCache();
  const originalFetch = globalThis.fetch;
  const payload = {
    error: "Video Deleted",
    message: "この動画は削除されているため取得できません。",
    detail: "この動画は削除されているため取得できません。",
    code: "deleted",
    videoId: "dQw4w9WgXcQ",
    cachedFailure: false,
    skippedYtDlp: false,
    recordedAt: "2026-07-27T12:34:56.789Z",
  };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse(payload, { status: 410 });
  };
  t.after(() => {
    clearStreamCache();
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => stream("dQw4w9WgXcQ", { retries: 1 }),
    (error) => {
      assert.equal(error.code, "deleted");
      assert.equal(error.status, 410);
      assert.equal(error.message, payload.message);
      assert.deepEqual(error.payload, payload);
      assert.equal(error.retryable, false);
      assert.equal(isVideoStreamError(error), true);
      return true;
    },
  );

  assert.equal(calls, 1);
});

test("stream exposes scheduled premiere errors for the type 2 player", async (t) => {
  clearStreamCache();
  const originalFetch = globalThis.fetch;
  const payload = {
    error: "Premiere Scheduled",
    message: "この動画は100分後にプレミア公開される予約動画です。",
    detail: "この動画は100分後にプレミア公開される予約動画です。",
    code: "premiere_scheduled",
    videoId: "_0x-iHlwc9s",
    cachedFailure: true,
    skippedYtDlp: true,
    recordedAt: "2026-07-27T07:34:55.629Z",
    expiresAt: "2026-07-27T09:14:55.630Z",
  };
  globalThis.fetch = async () => jsonResponse(payload);
  t.after(() => {
    clearStreamCache();
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => stream("_0x-iHlwc9s", { retries: 1 }),
    (error) => {
      assert.equal(error.code, "premiere_scheduled");
      assert.equal(error.message, payload.message);
      assert.deepEqual(error.payload, payload);
      assert.equal(error.retryable, false);
      assert.equal(isVideoStreamError(error), true);
      return true;
    },
  );
});

test("video stream error detection only accepts documented fixed codes", () => {
  for (const code of [
    "members_only",
    "private",
    "deleted",
    "copyright_removed",
    "account_terminated",
    "unavailable",
    "premiere_scheduled",
  ]) {
    assert.equal(isVideoStreamError({ code }), true);
  }
  assert.equal(isVideoStreamError({ code: "Video Deleted" }), false);
  assert.equal(isVideoStreamError({ code: "HTTP_ERROR" }), false);
});

test("Apps Script deployments call SiaTube directly", async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.window = {
    location: { hostname: "example.script.googleusercontent.com" },
    google: { script: { run: {} } },
  };
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return jsonResponse(["猫", "猫 動画"]);
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  });

  const result = await suggest("猫");
  assert.deepEqual(result, ["猫", "猫 動画"]);
  assert.equal(
    requestedUrl,
    "https://siatube.com/api/suggest/?keyword=%E7%8C%AB",
  );
});

test("configured proxy wraps SiaTube GET requests without changing the method", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map([
    ["requestProxyUrl", JSON.stringify("https://proxy.test/forward")],
  ]);
  let requestedUrl = "";
  let requestedOptions = null;

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  globalThis.fetch = async (url, options) => {
    requestedUrl = String(url);
    requestedOptions = options;
    return jsonResponse({ items: [] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  await search("proxy test", { retries: 0 });

  const target = "https://siatube.com/api/search?q=proxy+test";
  assert.equal(
    requestedUrl,
    `https://proxy.test/forward?url=${encodeURIComponent(target)}`,
  );
  assert.equal(requestedOptions.method, "GET");
});

test("final proxy connection errors identify the proxy and explain the proxy path", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const proxyUrl = "https://proxy.test/forward";
  const values = new Map([
    ["requestProxyUrl", JSON.stringify(proxyUrl)],
  ]);

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  await assert.rejects(
    () => search("proxy failure", { retries: 0, timeout: 0 }),
    (error) => {
      assert.equal(error.code, "NETWORK_ERROR");
      assert.equal(error.proxyUsed, true);
      assert.equal(error.proxyUrl, proxyUrl);
      assert.equal(error.connectionFailure, true);
      assert.match(error.message, /プロキシ経由/);
      assert.match(error.message, /プロキシ設定/);
      return true;
    },
  );
});

test("final direct connection errors explain the direct network path", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map();

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.fetch = async () => {
    throw new TypeError("offline");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  await assert.rejects(
    () => search("direct failure", { retries: 0, timeout: 0 }),
    (error) => {
      assert.equal(error.code, "NETWORK_ERROR");
      assert.equal(error.proxyUsed, false);
      assert.equal(error.proxyUrl, null);
      assert.equal(error.connectionFailure, true);
      assert.match(error.message, /ネットワーク接続/);
      assert.doesNotMatch(error.message, /プロキシ/);
      return true;
    },
  );
});

test("a request keeps its initial proxy URL across retries", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalSetTimeout = globalThis.setTimeout;
  const initialProxyUrl = "https://proxy-a.test/forward";
  const replacementProxyUrl = "https://proxy-b.test/forward";
  const values = new Map([
    ["requestProxyUrl", JSON.stringify(initialProxyUrl)],
  ]);
  const requestedUrls = [];

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  // Keep the production retry path while avoiding its real 250ms backoff.
  globalThis.setTimeout = (callback, _delay, ...args) => (
    originalSetTimeout(callback, 0, ...args)
  );
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) {
      values.set("requestProxyUrl", JSON.stringify(replacementProxyUrl));
      return jsonResponse({ message: "temporarily unavailable" }, { status: 503 });
    }
    return jsonResponse({ items: [] });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  await search("snapshot", { retries: 1, timeout: 0 });

  const target = "https://siatube.com/api/search?q=snapshot";
  const expectedUrl = `${initialProxyUrl}?url=${encodeURIComponent(target)}`;
  assert.deepEqual(requestedUrls, [expectedUrl, expectedUrl]);
});

test("two final proxied load failures trigger one cached recovery check", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  const originalSetTimeout = globalThis.setTimeout;
  const proxyUrl = "https://recovery-proxy.test/forward";
  const localValues = new Map([
    ["requestProxyUrl", JSON.stringify(proxyUrl)],
  ]);
  const sessionValues = new Map();
  let pageCalls = 0;
  let healthcheckCalls = 0;
  const healthcheckUrl = `${proxyUrl}?url=${encodeURIComponent("https://siatube.com/")}`;

  const storage = (values) => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  });
  globalThis.localStorage = storage(localValues);
  globalThis.sessionStorage = storage(sessionValues);
  globalThis.fetch = async (url) => {
    if (String(url) === healthcheckUrl) {
      healthcheckCalls += 1;
      return jsonResponse({ status: "ok" });
    }
    pageCalls += 1;
    throw new TypeError("offline");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  });

  // Exercise retry exhaustion without paying the production 250ms backoff.
  globalThis.setTimeout = (callback, _delay, ...args) => (
    originalSetTimeout(callback, 0, ...args)
  );
  await assert.rejects(
    () => search("first load", { retries: 1, timeout: 0 }),
    { code: "NETWORK_ERROR" },
  );
  globalThis.setTimeout = originalSetTimeout;

  assert.equal(pageCalls, 2);
  assert.equal(healthcheckCalls, 0);
  const firstFailures = JSON.parse(sessionValues.get(REQUEST_PROXY_FAILURE_KEY));
  assert.equal(firstFailures.entries[0].url, proxyUrl);
  assert.equal(firstFailures.entries[0].count, 1);

  await assert.rejects(
    () => search("second load", { retries: 0, timeout: 0 }),
    { code: "NETWORK_ERROR" },
  );

  // Recovery is intentionally fire-and-forget from the failed page request.
  for (let turn = 0; turn < 10 && !localValues.has(REQUEST_PROXY_HEALTH_KEY); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(pageCalls, 3);
  assert.equal(healthcheckCalls, 1);
  assert.equal(sessionValues.has(REQUEST_PROXY_FAILURE_KEY), false);
  const health = JSON.parse(localValues.get(REQUEST_PROXY_HEALTH_KEY)).entries[0];
  assert.equal(health.url, proxyUrl);
  assert.equal(health.status, "success");
  assert.equal(health.reason, "load-errors");
  assert.equal(health.guaranteedUntil - health.checkedAt, 30 * 60 * 1_000);
});

test("JSONP proxy injects a script, preserves the target query, and accepts direct GAS data", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const proxyUrl = "https://proxy.test/jsonp";
  const values = new Map([
    ["requestProxyUrl", JSON.stringify(proxyUrl)],
    ["requestProxyJsonpEnabled", JSON.stringify(true)],
  ]);
  const callbackTarget = {};
  const scriptUrls = [];
  let fetchCalls = 0;

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = callbackTarget;
  globalThis.document = {
    createElement: (name) => {
      assert.equal(name, "script");
      return { remove() {} };
    },
    head: {
      appendChild: (script) => {
        scriptUrls.push(script.src);
        const callbackName = new URL(script.src).searchParams.get("callback");
        queueMicrotask(() => callbackTarget[callbackName]({
          items: [{ id: "from-jsonp" }],
          page: 1,
        }));
      },
    },
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("fetch must not be used while JSONP is enabled");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  const result = await search("JSONP & query", { retries: 0, timeout: 0 });

  assert.deepEqual(result, { items: [{ id: "from-jsonp" }], page: 1 });
  assert.equal(fetchCalls, 0);
  assert.equal(scriptUrls.length, 1);
  const scriptUrl = new URL(scriptUrls[0]);
  const callbackName = scriptUrl.searchParams.get("callback");
  const targetUrl = "https://siatube.com/api/search?q=JSONP+%26+query";
  assert.match(callbackName, /^__siatubeJsonp_/);
  assert.equal(scriptUrl.searchParams.get("url"), targetUrl);
  assert.equal(
    scriptUrls[0],
    `${proxyUrl}?callback=${encodeURIComponent(callbackName)}` +
      `&url=${encodeURIComponent(targetUrl)}`,
  );
});

test("JSONP retries an ok:false response using the request's initial proxy settings", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const originalSetTimeout = globalThis.setTimeout;
  const initialProxyUrl = "https://proxy-a.test/jsonp";
  const replacementProxyUrl = "https://proxy-b.test/jsonp";
  const values = new Map([
    ["requestProxyUrl", JSON.stringify(initialProxyUrl)],
    ["requestProxyJsonpEnabled", JSON.stringify(true)],
  ]);
  const callbackTarget = {};
  const scriptUrls = [];
  let fetchCalls = 0;

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = callbackTarget;
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild: (script) => {
        const attempt = scriptUrls.length;
        scriptUrls.push(script.src);
        const callbackName = new URL(script.src).searchParams.get("callback");
        if (attempt === 0) {
          // A settings change while retrying must not switch transport or proxy URL.
          values.set("requestProxyUrl", JSON.stringify(replacementProxyUrl));
          values.set("requestProxyJsonpEnabled", JSON.stringify(false));
        }
        const envelope = attempt === 0
          ? { ok: false, status: 503, error: "temporarily unavailable" }
          : { ok: true, status: 200, data: { items: ["retried"] } };
        queueMicrotask(() => callbackTarget[callbackName](envelope));
      },
    },
  };
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("retry must remain on JSONP");
  };
  globalThis.setTimeout = (callback, _delay, ...args) => (
    originalSetTimeout(callback, 0, ...args)
  );
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  const result = await search("snapshot jsonp", { retries: 1, timeout: 0 });

  assert.deepEqual(result, { items: ["retried"] });
  assert.equal(fetchCalls, 0);
  assert.equal(scriptUrls.length, 2);
  const targetUrl = "https://siatube.com/api/search?q=snapshot+jsonp";
  for (const source of scriptUrls) {
    const parsed = new URL(source);
    assert.equal(`${parsed.origin}${parsed.pathname}`, initialProxyUrl);
    assert.equal(parsed.searchParams.get("url"), targetUrl);
  }
});

test("final JSONP load errors report the JSONP proxy transport", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  const proxyUrl = "https://proxy.test/jsonp";
  const values = new Map([
    ["requestProxyUrl", JSON.stringify(proxyUrl)],
    ["requestProxyJsonpEnabled", JSON.stringify(true)],
  ]);

  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  globalThis.window = {};
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild: (script) => {
        queueMicrotask(() => script.onerror?.({ type: "error" }));
      },
    },
  };
  globalThis.fetch = async () => {
    throw new Error("fetch must not be used while JSONP is enabled");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  await assert.rejects(
    () => search("jsonp failure", { retries: 0, timeout: 0 }),
    (error) => {
      assert.equal(error.code, "NETWORK_ERROR");
      assert.equal(error.proxyUsed, true);
      assert.equal(error.proxyUrl, proxyUrl);
      assert.equal(error.proxyTransport, "jsonp");
      assert.equal(error.connectionFailure, true);
      assert.match(error.message, /JSONPプロキシ経由/);
      return true;
    },
  );
});
