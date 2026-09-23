import test from "node:test";
import assert from "node:assert/strict";

import { search, youtubeEducationStream } from "../src/services/siatubeApi.js";
import {
  __resetGuardSessionForTests,
  saveGuardSession,
} from "../src/guard/guard-session.js";
import { __resetChallengeForTests } from "../src/guard/challenge.js";

const SESSION_ID = "S".repeat(43);
const CHALLENGE_ID = "H".repeat(22);

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installGlobals(t, values = new Map()) {
  const originals = {
    fetch: globalThis.fetch,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    document: globalThis.document,
  };
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  __resetGuardSessionForTests();
  __resetChallengeForTests();
  t.after(() => {
    __resetGuardSessionForTests();
    __resetChallengeForTests();
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  });
  return values;
}

test("YouTube Education stream uses the authenticated API URL and its response", async (t) => {
  installGlobals(t);
  saveGuardSession({
    version: 1,
    sessionId: SESSION_ID,
    expiresAt: Date.now() + 60_000,
    verifiedUntil: Date.now() + 60_000,
  });
  let requestedUrl;
  globalThis.fetch = async (input) => {
    requestedUrl = new URL(input);
    return response({ url: "https://www.youtubeeducation.com/embed/OHAjc-ayhus" });
  };

  const data = await youtubeEducationStream("OHAjc-ayhus", { retries: 0 });

  assert.equal(requestedUrl.origin, "https://siatube.com");
  assert.equal(requestedUrl.pathname, "/api/stream/youtubeeducation/OHAjc-ayhus");
  assert.equal(requestedUrl.searchParams.get("origin"), "siatube");
  assert.equal(requestedUrl.searchParams.get("guard_sid"), SESSION_ID);
  assert.equal(data.url, "https://www.youtubeeducation.com/embed/OHAjc-ayhus");
});

test("SiaTube API completes URL-parameter authentication and replays the original query", async (t) => {
  installGlobals(t);
  const calls = [];
  let searchCalls = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname === "/api/search") {
      searchCalls += 1;
      if (searchCalls === 1) {
        return response({ code: "CHALLENGE_REQUIRED", sessionId: SESSION_ID }, 403);
      }
      return response({ items: ["authenticated"] });
    }
    if (url.pathname.endsWith("/status")) {
      return response({ verified: false, sessionId: SESSION_ID });
    }
    if (url.pathname.endsWith("/challenge")) {
      return response({
        sessionId: SESSION_ID,
        challengeId: CHALLENGE_ID,
        nonce: "integration",
        difficultyBits: 0,
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        version: 1,
      });
    }
    if (url.pathname.endsWith("/verify")) {
      assert.equal(url.searchParams.get("challenge_id"), CHALLENGE_ID);
      assert.equal(url.searchParams.get("counter"), "0");
      return response({
        ok: true,
        sessionId: SESSION_ID,
        verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800,
      });
    }
    throw new Error(`Unexpected request path: ${url.pathname}`);
  };

  assert.deepEqual(await search("猫", { retries: 0, timeout: 0 }), {
    items: ["authenticated"],
  });
  const replay = calls.filter((url) => url.pathname === "/api/search").at(-1);
  assert.equal(replay.searchParams.get("q"), "猫");
  assert.equal(replay.searchParams.get("guard_sid"), SESSION_ID);
});

test("direct-payload GAS JSONP authenticates even when upstream status and headers are lost", async (t) => {
  const proxyUrl = "https://proxy.test/jsonp";
  installGlobals(t, new Map([
    ["requestProxyUrl", JSON.stringify(proxyUrl)],
    ["requestProxyJsonpEnabled", JSON.stringify(true)],
  ]));
  const callbackTarget = {};
  const targets = [];
  let searchCalls = 0;
  globalThis.window = callbackTarget;
  globalThis.document = {
    createElement: () => ({ remove() {} }),
    head: {
      appendChild: (script) => {
        const source = new URL(script.src);
        const callback = source.searchParams.get("callback");
        const target = new URL(source.searchParams.get("url"));
        targets.push(target);
        let payload;
        if (target.pathname === "/api/search") {
          searchCalls += 1;
          payload = searchCalls === 1
            ? { code: "CHALLENGE_REQUIRED", sessionId: SESSION_ID }
            : { items: ["jsonp-authenticated"] };
        } else if (target.pathname.endsWith("/status")) {
          payload = { verified: false, sessionId: SESSION_ID };
        } else if (target.pathname.endsWith("/challenge")) {
          payload = {
            sessionId: SESSION_ID,
            challengeId: CHALLENGE_ID,
            nonce: "jsonp",
            difficultyBits: 0,
            expiresAt: Math.floor(Date.now() / 1_000) + 60,
            version: 1,
          };
        } else if (target.pathname.endsWith("/verify")) {
          payload = {
            ok: true,
            sessionId: SESSION_ID,
            verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800,
          };
        }
        queueMicrotask(() => callbackTarget[callback](payload));
      },
    },
  };
  globalThis.fetch = async () => {
    throw new Error("JSONP flow must not call fetch");
  };

  assert.deepEqual(await search("gas query", { retries: 0, timeout: 0 }), {
    items: ["jsonp-authenticated"],
  });
  const searchTargets = targets.filter((url) => url.pathname === "/api/search");
  assert.equal(searchTargets.length, 2);
  assert.equal(searchTargets[1].searchParams.get("q"), "gas query");
  assert.equal(searchTargets[1].searchParams.get("guard_sid"), SESSION_ID);
});

test("a failed authenticated replay redacts credentials from the public error", async (t) => {
  installGlobals(t);
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/status")) {
      return response({ verified: false, sessionId: SESSION_ID });
    }
    if (url.pathname.endsWith("/challenge")) {
      return response({
        sessionId: SESSION_ID,
        challengeId: CHALLENGE_ID,
        nonce: "redaction",
        difficultyBits: 0,
        expiresAt: Math.floor(Date.now() / 1_000) + 60,
        version: 1,
      });
    }
    if (url.pathname.endsWith("/verify")) {
      return response({
        ok: true,
        sessionId: SESSION_ID,
        verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800,
      });
    }
    return response({
      code: "CHALLENGE_REQUIRED",
      sessionId: SESSION_ID,
    }, 403);
  };

  await assert.rejects(
    () => search("redact", { retries: 0, timeout: 0 }),
    (error) => {
      assert.equal(error.code, "CHALLENGE_REQUIRED");
      assert.equal(error.url.includes(SESSION_ID), false);
      assert.equal(Object.prototype.hasOwnProperty.call(error.payload, "sessionId"), false);
      assert.equal(JSON.stringify(error).includes(SESSION_ID), false);
      return true;
    },
  );
});

test("429 retry uses retryAfter from the JSON body and retries once", async (t) => {
  installGlobals(t);
  const originalSetTimeout = globalThis.setTimeout;
  const originalRandom = Math.random;
  const delays = [];
  let calls = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    delays.push(delay);
    return originalSetTimeout(callback, 0, ...args);
  };
  Math.random = () => 0;
  t.after(() => {
    globalThis.setTimeout = originalSetTimeout;
    Math.random = originalRandom;
  });
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? response({ code: "RATE_LIMITED", retryAfter: 7, sessionId: SESSION_ID }, 429)
      : response({ items: ["retried"] });
  };

  assert.deepEqual(await search("limited", { retries: 1, timeout: 0 }), {
    items: ["retried"],
  });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [7_000]);
});
