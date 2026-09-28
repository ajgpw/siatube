import test from "node:test";
import assert from "node:assert/strict";
import {
  checkRequestProxy,
  ensureRequestProxyHealth,
  jsonpRequestUrl,
  loadRequestProxy,
  loadRequestProxyHealth,
  loadRequestProxyJsonp,
  normalizeRequestProxyUrl,
  proxiedRequestUrl,
  recordRequestProxyLoadFailure,
  recordRequestProxyLoadSuccess,
  requestProxyJsonp,
  REQUEST_PROXY_HEALTH_TTL_MS,
  REQUEST_PROXY_RECOVERY_GUARANTEE_MS,
  saveRequestProxy,
  saveRequestProxyJsonp,
} from "../src/services/network/requestProxy.js";

function installMemoryStorage(t) {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  const localValues = new Map();
  const sessionValues = new Map();

  const makeStorage = (values) => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  });

  globalThis.localStorage = makeStorage(localValues);
  globalThis.sessionStorage = makeStorage(sessionValues);
  t.after(() => {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalSessionStorage;
  });

  return { localValues, sessionValues };
}

function successfulProxyResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ status: "ok" }),
  };
}

function createJsonpHarness() {
  const callbackTarget = {};
  const scripts = [];
  const removedScripts = [];
  const host = {
    appendChild(script) {
      script.parentNode = host;
      scripts.push(script);
      return script;
    },
    removeChild(script) {
      const index = scripts.indexOf(script);
      if (index >= 0) scripts.splice(index, 1);
      script.parentNode = null;
      removedScripts.push(script);
      return script;
    },
  };
  const documentRef = {
    head: host,
    createElement(tagName) {
      assert.equal(tagName, "script");
      return {
        async: false,
        src: "",
        onerror: null,
        onload: null,
        parentNode: null,
        remove() {
          if (this.parentNode) this.parentNode.removeChild(this);
        },
      };
    },
  };

  const currentRequest = () => {
    assert.equal(scripts.length, 1);
    const script = scripts[0];
    const callbackName = new URL(script.src).searchParams.get("callback");
    assert.equal(typeof callbackTarget[callbackName], "function");
    return { callbackName, script };
  };

  const assertCleanedUp = (script, callbackName) => {
    assert.equal(scripts.length, 0);
    assert.equal(removedScripts.includes(script), true);
    assert.equal(script.parentNode, null);
    assert.equal(script.onload, null);
    assert.equal(script.onerror, null);
    assert.equal(Object.hasOwn(callbackTarget, callbackName), false);
  };

  return {
    assertCleanedUp,
    callbackTarget,
    currentRequest,
    documentRef,
  };
}

test("leaves requests unchanged when the proxy URL is empty", () => {
  const target = "https://siatube.com/api/search?q=hello%20world";
  assert.equal(proxiedRequestUrl(target, { url: "" }), target);
});

test("a non-empty proxy URL automatically wraps the complete request URL", () => {
  const target = "https://siatube.com/api/search?q=猫&token=a%2Fb#results";
  assert.equal(
    proxiedRequestUrl(target, { url: "https://proxy.test/forward" }),
    `https://proxy.test/forward?url=${encodeURIComponent(target)}`,
  );
});

test("builds the JSONP URL with callback first and the complete target encoded once", () => {
  const proxyUrl = "https://proxy.test/forward";
  const target = "https://siatube.com/api/data?page=1&limit=10";

  assert.equal(
    jsonpRequestUrl(target, proxyUrl, "receiveData"),
    `${proxyUrl}?callback=receiveData&url=${encodeURIComponent(target)}`,
  );
});

test("loads JSONP dynamically, returns its envelope, and removes temporary state", async () => {
  const harness = createJsonpHarness();
  const proxyUrl = "https://proxy.test/forward";
  const target = "https://siatube.com/api/data?page=1&limit=10";
  const pending = requestProxyJsonp(target, {
    proxyUrl,
    documentRef: harness.documentRef,
    callbackTarget: harness.callbackTarget,
  });
  const { callbackName, script } = harness.currentRequest();

  assert.equal(script.async, true);
  assert.equal(
    script.src,
    `${proxyUrl}?callback=${encodeURIComponent(callbackName)}` +
      `&url=${encodeURIComponent(target)}`,
  );

  const envelope = {
    ok: true,
    status: 200,
    data: { status: "ok", items: [1, 2] },
  };
  harness.callbackTarget[callbackName](envelope);

  assert.deepEqual(await pending, envelope);
  harness.assertCleanedUp(script, callbackName);
});

test("normalizes a direct JSONP payload returned by a GAS deployment", async () => {
  const harness = createJsonpHarness();
  const pending = requestProxyJsonp("https://siatube.com/api/suggest/?keyword=test", {
    proxyUrl: "https://script.google.com/macros/s/example/exec",
    documentRef: harness.documentRef,
    callbackTarget: harness.callbackTarget,
  });
  const { callbackName, script } = harness.currentRequest();
  const directPayload = ["test me", "test drive"];

  harness.callbackTarget[callbackName](directPayload);

  assert.deepEqual(await pending, {
    ok: true,
    status: 200,
    data: directPayload,
  });
  harness.assertCleanedUp(script, callbackName);
});

test("aborting JSONP removes its script and safely absorbs a delayed callback", async () => {
  const harness = createJsonpHarness();
  const controller = new AbortController();
  const pending = requestProxyJsonp("https://siatube.com/api/data", {
    proxyUrl: "https://proxy.test/forward",
    signal: controller.signal,
    documentRef: harness.documentRef,
    callbackTarget: harness.callbackTarget,
  });
  const { callbackName, script } = harness.currentRequest();
  const rejected = assert.rejects(pending, (error) => {
    assert.equal(error.name, "AbortError");
    assert.equal(error.code, "ABORTED");
    return true;
  });

  controller.abort("route changed");
  await rejected;

  assert.equal(script.parentNode, null);
  assert.equal(typeof harness.callbackTarget[callbackName], "function");
  assert.doesNotThrow(() => {
    harness.callbackTarget[callbackName]({
      ok: true,
      status: 200,
      data: { status: "ok" },
    });
  });

  const delayedLoad = script.onload;
  assert.equal(typeof delayedLoad, "function");
  delayedLoad();
  harness.assertCleanedUp(script, callbackName);
});

test("a JSONP script load error rejects and removes temporary state", async () => {
  const harness = createJsonpHarness();
  const pending = requestProxyJsonp("https://siatube.com/api/data", {
    proxyUrl: "https://proxy.test/forward",
    documentRef: harness.documentRef,
    callbackTarget: harness.callbackTarget,
  });
  const { callbackName, script } = harness.currentRequest();
  const onerror = script.onerror;
  const event = { type: "error" };
  const rejected = assert.rejects(pending, (error) => {
    assert.equal(error.code, "NETWORK_ERROR");
    assert.strictEqual(error.cause, event);
    return true;
  });

  onerror(event);
  await rejected;
  harness.assertCleanedUp(script, callbackName);
});

test("JSONP loading without a callback rejects and removes temporary state", async () => {
  const harness = createJsonpHarness();
  const pending = requestProxyJsonp("https://siatube.com/api/data", {
    proxyUrl: "https://proxy.test/forward",
    documentRef: harness.documentRef,
    callbackTarget: harness.callbackTarget,
  });
  const { callbackName, script } = harness.currentRequest();
  const onload = script.onload;
  const rejected = assert.rejects(pending, (error) => {
    assert.equal(error.code, "INVALID_JSON");
    assert.match(error.message, /without calling its callback/);
    return true;
  });

  onload();
  await rejected;
  harness.assertCleanedUp(script, callbackName);
});

test("trims the proxy URL and accepts URL objects", () => {
  const target = new URL("https://siatube.com/api/search?q=test");
  assert.equal(
    proxiedRequestUrl(target, "  https://proxy.test/forward?  "),
    `https://proxy.test/forward?url=${encodeURIComponent(target.toString())}`,
  );
});

test("does not proxy non-HTTP request URLs", () => {
  assert.equal(proxiedRequestUrl("blob:abc", { url: "https://proxy.test" }), "blob:abc");
});

test("rejects invalid proxy URLs instead of silently making a direct request", () => {
  const target = "https://siatube.com/api";
  assert.throws(() => proxiedRequestUrl(target, { url: "not a url" }), TypeError);
  assert.throws(() => proxiedRequestUrl(target, { url: "ftp://proxy.test" }), TypeError);
  assert.throws(() => proxiedRequestUrl(target, { url: "https://proxy.test?token=x" }), TypeError);
  assert.throws(() => proxiedRequestUrl(target, { url: "https://proxy.test#fragment" }), TypeError);
  assert.throws(() => proxiedRequestUrl(target, { url: "https://user:pass@proxy.test" }), TypeError);
});

test("normalizes harmless trailing URL delimiters", () => {
  assert.equal(normalizeRequestProxyUrl(" https://proxy.test/path? "), "https://proxy.test/path");
  assert.equal(normalizeRequestProxyUrl("https://proxy.test/path#"), "https://proxy.test/path");
});

test("saves and loads the proxy URL from localStorage", (t) => {
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  t.after(() => {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  });

  saveRequestProxy("  https://proxy.test/forward  ");
  assert.deepEqual(loadRequestProxy(), { url: "https://proxy.test/forward" });

  assert.throws(() => saveRequestProxy("not a URL"), TypeError);
  assert.deepEqual(loadRequestProxy(), { url: "https://proxy.test/forward" });

  values.set("requestProxyUrl", "https://legacy-proxy.test/forward");
  assert.deepEqual(loadRequestProxy(), { url: "https://legacy-proxy.test/forward" });

  assert.equal(loadRequestProxyJsonp(), false);
  assert.equal(saveRequestProxyJsonp(true), true);
  assert.equal(loadRequestProxyJsonp(), true);
  assert.equal(saveRequestProxyJsonp(false), false);
  assert.equal(loadRequestProxyJsonp(), false);
});

test("discards v1 health results that rejected direct GAS JSONP payloads", (t) => {
  const { localValues } = installMemoryStorage(t);
  const proxyUrl = "https://script.google.com/macros/s/example/exec";
  localValues.set("requestProxyHealth.v1", JSON.stringify({
    version: 1,
    entries: [{
      url: proxyUrl,
      transport: "jsonp",
      status: "error",
      checkedAt: 1_000,
      expiresAt: 1_000 + REQUEST_PROXY_HEALTH_TTL_MS,
      guaranteedUntil: 0,
      reason: "restore",
    }],
  }));

  assert.equal(
    loadRequestProxyHealth(proxyUrl, { now: 2_000, transport: "jsonp" }),
    null,
  );
  assert.equal(localValues.has("requestProxyHealth.v1"), false);
});

test("checks the SiaTube root through the candidate proxy exactly once", async () => {
  const calls = [];
  const payload = { status: "ok" };
  const result = await checkRequestProxy("https://proxy.test/forward", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      };
    },
  });

  assert.deepEqual(result, payload);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://proxy.test/forward?url=${encodeURIComponent("https://siatube.com/")}`,
  );
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Accept, "application/json");
  assert.equal(calls[0].options.credentials, "omit");
});

test("checks proxy health through JSONP and validates the unwrapped data", async () => {
  const proxyUrl = "https://proxy.test/forward";
  const signal = new AbortController().signal;
  const calls = [];
  const payload = { status: "ok", server: "siatube" };

  const result = await checkRequestProxy(proxyUrl, {
    transport: "jsonp",
    signal,
    fetchImpl: async () => {
      throw new Error("JSONP health checks must not use fetch");
    },
    jsonpRequestImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, data: payload };
    },
  });

  assert.deepEqual(result, payload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://siatube.com/");
  assert.equal(calls[0].options.proxyUrl, proxyUrl);
  assert.strictEqual(calls[0].options.signal, signal);
});

test("rejects a JSONP health response whose wrapper status is not 2xx", async () => {
  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      transport: "jsonp",
      jsonpRequestImpl: async () => ({
        ok: true,
        status: 500,
        data: { status: "ok" },
      }),
    }),
    /HTTP 500/,
  );
});

test("fails the proxy check for non-success responses and invalid JSON", async () => {
  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      fetchImpl: async () => ({ ok: false, status: 502 }),
    }),
    /HTTP 502/,
  );

  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError("invalid JSON"); },
      }),
    }),
    /invalid JSON/,
  );

  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => null,
      }),
    }),
    /invalid JSON/,
  );

  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", error: "upstream failed" }),
      }),
    }),
    /invalid JSON/,
  );

  await assert.rejects(
    checkRequestProxy("https://proxy.test/forward", {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: "   " }),
      }),
    }),
    /invalid JSON/,
  );
});

test("does not send a proxy check for an empty or invalid proxy URL", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({}) };
  };

  await assert.rejects(checkRequestProxy("", { fetchImpl }), TypeError);
  await assert.rejects(checkRequestProxy("not a URL", { fetchImpl }), TypeError);
  assert.equal(calls, 0);
});

test("retains a successful health result for 24 hours only for the same URL", async (t) => {
  installMemoryStorage(t);
  const checkedAt = Date.UTC(2026, 6, 20, 12, 0, 0);
  const firstUrl = "https://proxy-a.test/forward";
  const secondUrl = "https://proxy-b.test/forward";
  let firstChecks = 0;

  const first = await ensureRequestProxyHealth(firstUrl, {
    force: true,
    now: checkedAt,
    timeoutMs: 0,
    fetchImpl: async () => {
      firstChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(first.status, "success");
  assert.equal(first.expiresAt, checkedAt + REQUEST_PROXY_HEALTH_TTL_MS);

  let unexpectedChecks = 0;
  const restored = await ensureRequestProxyHealth(firstUrl, {
    now: checkedAt + REQUEST_PROXY_HEALTH_TTL_MS - 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      unexpectedChecks += 1;
      throw new Error("fresh cached state should be reused");
    },
  });
  assert.equal(restored.status, "success");
  assert.equal(restored.checkedAt, checkedAt);
  assert.equal(firstChecks, 1);
  assert.equal(unexpectedChecks, 0);
  assert.equal(loadRequestProxyHealth(secondUrl, { now: checkedAt + 1 }), null);

  let secondChecks = 0;
  const otherUrl = await ensureRequestProxyHealth(secondUrl, {
    now: checkedAt + 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      secondChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(otherUrl.status, "success");
  assert.equal(secondChecks, 1);
  assert.equal(loadRequestProxyHealth(firstUrl, { now: checkedAt + 1 })?.status, "success");
});

test("retains failed health checks for 24 hours and rechecks at exact expiry", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  const checkedAt = Date.UTC(2026, 6, 20, 13, 0, 0);
  let failedChecks = 0;

  const failed = await ensureRequestProxyHealth(proxyUrl, {
    force: true,
    now: checkedAt,
    timeoutMs: 0,
    fetchImpl: async () => {
      failedChecks += 1;
      throw new Error("proxy unavailable");
    },
  });
  assert.equal(failed.status, "error");
  assert.equal(failedChecks, 1);

  let freshCacheChecks = 0;
  const restored = await ensureRequestProxyHealth(proxyUrl, {
    now: checkedAt + REQUEST_PROXY_HEALTH_TTL_MS - 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      freshCacheChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(restored.status, "error");
  assert.equal(freshCacheChecks, 0);
  assert.equal(
    loadRequestProxyHealth(proxyUrl, { now: checkedAt + REQUEST_PROXY_HEALTH_TTL_MS }),
    null,
  );

  let expiryChecks = 0;
  const refreshed = await ensureRequestProxyHealth(proxyUrl, {
    now: checkedAt + REQUEST_PROXY_HEALTH_TTL_MS,
    timeoutMs: 0,
    fetchImpl: async () => {
      expiryChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(refreshed.status, "success");
  assert.equal(refreshed.checkedAt, checkedAt + REQUEST_PROXY_HEALTH_TTL_MS);
  assert.equal(expiryChecks, 1);
});

test("two page-load failures force a recovery check and protect success for 30 minutes", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  const checkedAt = Date.UTC(2026, 6, 20, 14, 0, 0);
  const recoveryAt = checkedAt + 2_000;

  await ensureRequestProxyHealth(proxyUrl, {
    force: true,
    now: checkedAt,
    timeoutMs: 0,
    fetchImpl: async () => successfulProxyResponse(),
  });

  let recoveryChecks = 0;
  const failure = { code: "NETWORK_ERROR" };
  const firstFailure = await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: checkedAt + 1_000,
    timeoutMs: 0,
    fetchImpl: async () => {
      recoveryChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(firstFailure, null);
  assert.equal(recoveryChecks, 0);

  const recovered = await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: recoveryAt,
    timeoutMs: 0,
    fetchImpl: async () => {
      recoveryChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(recoveryChecks, 1);
  assert.equal(recovered.status, "success");
  assert.equal(recovered.reason, "load-errors");
  assert.equal(recovered.checkedAt, recoveryAt);
  assert.equal(
    recovered.guaranteedUntil,
    recoveryAt + REQUEST_PROXY_RECOVERY_GUARANTEE_MS,
  );

  let protectedChecks = 0;
  const protectedResult = await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: recovered.guaranteedUntil - 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      protectedChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(protectedResult.status, "success");
  assert.equal(protectedResult.checkedAt, recoveryAt);
  assert.equal(protectedChecks, 0);

  await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: recovered.guaranteedUntil - 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      protectedChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(protectedChecks, 0);

  const firstAfterGuarantee = await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: recovered.guaranteedUntil,
    timeoutMs: 0,
    fetchImpl: async () => {
      protectedChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(firstAfterGuarantee, null);
  assert.equal(protectedChecks, 0);

  const secondAfterGuarantee = await recordRequestProxyLoadFailure(proxyUrl, {
    error: failure,
    now: recovered.guaranteedUntil + 1_000,
    timeoutMs: 0,
    fetchImpl: async () => {
      protectedChecks += 1;
      return successfulProxyResponse();
    },
  });
  assert.equal(secondAfterGuarantee.status, "success");
  assert.equal(protectedChecks, 1);
});

test("a successful page load resets the consecutive proxy failure count", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  const startedAt = Date.UTC(2026, 6, 20, 15, 0, 0);
  const error = { code: "TIMEOUT" };
  let recoveryChecks = 0;
  const fetchImpl = async () => {
    recoveryChecks += 1;
    return successfulProxyResponse();
  };

  assert.equal(await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt,
    timeoutMs: 0,
    fetchImpl,
  }), null);
  recordRequestProxyLoadSuccess(proxyUrl);

  assert.equal(await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt + 1_000,
    timeoutMs: 0,
    fetchImpl,
  }), null);
  assert.equal(recoveryChecks, 0);

  const recovered = await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt + 2_000,
    timeoutMs: 0,
    fetchImpl,
  });
  assert.equal(recovered.status, "success");
  assert.equal(recoveryChecks, 1);
});

test("shares an in-flight health check between callers for the same URL", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  let checks = 0;
  let finishCheck;
  const fetchImpl = async () => {
    checks += 1;
    return new Promise((resolve) => {
      finishCheck = () => resolve(successfulProxyResponse());
    });
  };

  const first = ensureRequestProxyHealth(proxyUrl, {
    force: true,
    now: Date.UTC(2026, 6, 20, 16, 0, 0),
    timeoutMs: 0,
    fetchImpl,
  });
  const second = ensureRequestProxyHealth(proxyUrl, {
    force: true,
    now: Date.UTC(2026, 6, 20, 16, 0, 1),
    timeoutMs: 0,
    fetchImpl,
  });

  assert.strictEqual(second, first);
  assert.equal(checks, 1);
  finishCheck();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(checks, 1);
});

test("keeps fetch and JSONP health caches separate for the same proxy URL", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  const checkedAt = Date.UTC(2026, 6, 20, 17, 0, 0);
  let fetchChecks = 0;
  let jsonpChecks = 0;

  const fetchState = await ensureRequestProxyHealth(proxyUrl, {
    transport: "fetch",
    now: checkedAt,
    timeoutMs: 0,
    fetchImpl: async () => {
      fetchChecks += 1;
      return successfulProxyResponse();
    },
  });
  const jsonpState = await ensureRequestProxyHealth(proxyUrl, {
    transport: "jsonp",
    now: checkedAt + 1,
    timeoutMs: 0,
    fetchImpl: async () => {
      throw new Error("JSONP must not reuse the fetch transport");
    },
    jsonpRequestImpl: async () => {
      jsonpChecks += 1;
      return { ok: true, status: 200, data: { status: "ok" } };
    },
  });

  assert.equal(fetchState.transport, "fetch");
  assert.equal(jsonpState.transport, "jsonp");
  assert.equal(fetchChecks, 1);
  assert.equal(jsonpChecks, 1);
  assert.equal(loadRequestProxyHealth(proxyUrl, {
    transport: "fetch",
    now: checkedAt + 2,
  })?.checkedAt, checkedAt);
  assert.equal(loadRequestProxyHealth(proxyUrl, {
    transport: "jsonp",
    now: checkedAt + 2,
  })?.checkedAt, checkedAt + 1);

  await ensureRequestProxyHealth(proxyUrl, {
    transport: "fetch",
    now: checkedAt + 2,
    fetchImpl: async () => {
      throw new Error("fresh fetch cache should be reused");
    },
  });
  await ensureRequestProxyHealth(proxyUrl, {
    transport: "jsonp",
    now: checkedAt + 2,
    jsonpRequestImpl: async () => {
      throw new Error("fresh JSONP cache should be reused");
    },
  });
  assert.equal(fetchChecks, 1);
  assert.equal(jsonpChecks, 1);
});

test("shares one in-flight JSONP health check for matching callers", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  let checks = 0;
  let finishCheck;
  const jsonpRequestImpl = async () => {
    checks += 1;
    return new Promise((resolve) => {
      finishCheck = () => resolve({
        ok: true,
        status: 200,
        data: { status: "ok" },
      });
    });
  };

  const first = ensureRequestProxyHealth(proxyUrl, {
    transport: "jsonp",
    force: true,
    now: Date.UTC(2026, 6, 20, 18, 0, 0),
    timeoutMs: 0,
    jsonpRequestImpl,
  });
  const second = ensureRequestProxyHealth(proxyUrl, {
    transport: "jsonp",
    force: true,
    now: Date.UTC(2026, 6, 20, 18, 0, 1),
    timeoutMs: 0,
    jsonpRequestImpl,
  });

  assert.strictEqual(second, first);
  assert.equal(checks, 1);
  finishCheck();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(secondResult, firstResult);
  assert.equal(firstResult.transport, "jsonp");
  assert.equal(checks, 1);
});

test("keeps fetch and JSONP failure recovery counters separate", async (t) => {
  installMemoryStorage(t);
  const proxyUrl = "https://proxy.test/forward";
  const error = { code: "NETWORK_ERROR" };
  const startedAt = Date.UTC(2026, 6, 20, 19, 0, 0);
  let jsonpChecks = 0;
  const jsonpRequestImpl = async () => {
    jsonpChecks += 1;
    return { ok: true, status: 200, data: { status: "ok" } };
  };

  assert.equal(await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt,
    transport: "fetch",
  }), null);
  assert.equal(await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt + 1,
    transport: "jsonp",
    jsonpRequestImpl,
    timeoutMs: 0,
  }), null);
  assert.equal(jsonpChecks, 0);

  const recovered = await recordRequestProxyLoadFailure(proxyUrl, {
    error,
    now: startedAt + 2,
    transport: "jsonp",
    jsonpRequestImpl,
    timeoutMs: 0,
  });
  assert.equal(recovered.status, "success");
  assert.equal(recovered.transport, "jsonp");
  assert.equal(jsonpChecks, 1);
});
