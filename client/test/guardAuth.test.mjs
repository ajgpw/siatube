import test from "node:test";
import assert from "node:assert/strict";

import {
  GUARD_SESSION_STORAGE_KEY,
  GUARD_SESSION_TTL_MS,
  __resetGuardSessionForTests,
  acceptReturnedSession,
  loadGuardSession,
  redactGuardUrl,
  saveGuardSession,
  withGuardSession,
} from "../src/guard/guard-session.js";
import { hasLeadingZeroBits, sha256 } from "../src/guard/hash.js";
import {
  __resetChallengeForTests,
  ensureGuardChallenge,
  solveGuardChallenge,
} from "../src/guard/challenge.js";
import {
  guardedGet,
  isChallengeRequired,
} from "../src/guard/guarded-request.js";

const SESSION_A = "A".repeat(43);
const SESSION_B = "B".repeat(43);
const CHALLENGE_A = "C".repeat(22);

function storageHarness(initial = new Map()) {
  return {
    values: initial,
    storage: {
      getItem: (key) => initial.get(key) ?? null,
      setItem: (key, value) => initial.set(key, value),
      removeItem: (key) => initial.delete(key),
    },
  };
}

function installStorage(t, initial) {
  const original = globalThis.localStorage;
  const harness = storageHarness(initial);
  globalThis.localStorage = harness.storage;
  __resetGuardSessionForTests();
  __resetChallengeForTests();
  t.after(() => {
    __resetGuardSessionForTests();
    __resetChallengeForTests();
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  });
  return harness;
}

test("guard session persists valid values and removes corrupt or expired values", (t) => {
  const harness = installStorage(t);
  const now = Date.now();
  saveGuardSession({
    version: 1,
    sessionId: SESSION_A,
    expiresAt: now + GUARD_SESSION_TTL_MS,
    verifiedUntil: now + 30_000,
  });
  assert.equal(loadGuardSession(now).sessionId, SESSION_A);

  harness.values.set(GUARD_SESSION_STORAGE_KEY, "{broken");
  assert.equal(loadGuardSession(now), null);
  assert.equal(harness.values.has(GUARD_SESSION_STORAGE_KEY), false);
  harness.values.set(GUARD_SESSION_STORAGE_KEY, JSON.stringify({
    version: 1,
    sessionId: SESSION_A,
    expiresAt: now - 1,
    verifiedUntil: 0,
  }));
  assert.equal(loadGuardSession(now), null);
  assert.equal(harness.values.has(GUARD_SESSION_STORAGE_KEY), false);
});

test("guard session falls back to memory when localStorage throws", (t) => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error("storage disabled"); },
    setItem() { throw new Error("storage disabled"); },
    removeItem() { throw new Error("storage disabled"); },
  };
  __resetGuardSessionForTests();
  t.after(() => {
    __resetGuardSessionForTests();
    if (original === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = original;
  });
  const now = Date.now();
  saveGuardSession({
    version: 1,
    sessionId: SESSION_A,
    expiresAt: now + GUARD_SESSION_TTL_MS,
    verifiedUntil: 0,
  });
  assert.equal(loadGuardSession(now).sessionId, SESSION_A);
});

test("guard URLs overwrite the session and redact every reserved parameter", () => {
  const guarded = withGuardSession(
    "https://siatube.com/api/search?q=cat&guard_sid=wrong",
    SESSION_A,
  );
  const parsed = new URL(guarded);
  assert.equal(parsed.searchParams.get("q"), "cat");
  assert.equal(parsed.searchParams.get("guard_sid"), SESSION_A);

  const redacted = redactGuardUrl(
    `${guarded}&challenge_id=${CHALLENGE_A}&counter=42`,
  );
  assert.equal(redacted, "https://siatube.com/api/search?q=cat");
});

test("SHA-256 and leading-zero checks support full and partial bytes", () => {
  assert.equal(
    Buffer.from(sha256("abc")).toString("hex"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(hasLeadingZeroBits(Uint8Array.from([0x00, 0x0f]), 12), true);
  assert.equal(hasLeadingZeroBits(Uint8Array.from([0x00, 0x1f]), 12), false);
  assert.equal(hasLeadingZeroBits(Uint8Array.from([0x00, 0xff]), 8), true);
});

test("only 403 plus CHALLENGE_REQUIRED starts authentication", () => {
  assert.equal(isChallengeRequired({ status: 403, payload: { code: "CHALLENGE_REQUIRED" } }), true);
  assert.equal(isChallengeRequired({ status: 401, payload: { code: "CHALLENGE_REQUIRED" } }), false);
  assert.equal(isChallengeRequired({ status: 403, payload: { code: "FORBIDDEN" } }), false);
});

test("guarded request performs challenge, verify, and one replay", async (t) => {
  installStorage(t);
  const calls = [];
  let apiCalls = 0;
  const send = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith("/status")) {
      return { ok: true, status: 200, payload: { verified: false, sessionId: SESSION_A } };
    }
    if (url.pathname === "/api/search") {
      apiCalls += 1;
      if (apiCalls === 1) {
        return { ok: false, status: 403, payload: { code: "CHALLENGE_REQUIRED", sessionId: SESSION_A } };
      }
      return { ok: true, status: 200, payload: { items: ["ok"] } };
    }
    if (url.pathname.endsWith("/challenge")) {
      return {
        ok: true,
        status: 200,
        payload: {
          sessionId: SESSION_A,
          challengeId: CHALLENGE_A,
          nonce: "nonce",
          difficultyBits: 0,
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
          version: 1,
        },
      };
    }
    if (url.pathname.endsWith("/verify")) {
      assert.equal(url.searchParams.get("guard_sid"), SESSION_A);
      assert.equal(url.searchParams.get("challenge_id"), CHALLENGE_A);
      assert.equal(url.searchParams.get("counter"), "0");
      return {
        ok: true,
        status: 200,
        payload: {
          ok: true,
          sessionId: SESSION_A,
          verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800,
        },
      };
    }
    throw new Error(`unexpected path ${url.pathname}`);
  };

  const response = await guardedGet("https://siatube.com/api/search?q=cat", { send });
  assert.deepEqual(response.payload, { items: ["ok"] });
  assert.equal(calls.length, globalThis.navigator?.locks ? 5 : 4);
  const replay = calls.at(-1);
  assert.equal(replay.searchParams.get("q"), "cat");
  assert.equal(replay.searchParams.get("guard_sid"), SESSION_A);
  assert.ok(loadGuardSession().verifiedUntil > Date.now());
});

test("ten simultaneous 403 responses share one challenge", async (t) => {
  installStorage(t);
  let challengeCalls = 0;
  let verifyCalls = 0;
  const perQueryCalls = new Map();
  const send = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/status")) {
      return { ok: true, status: 200, payload: { verified: false, sessionId: SESSION_A } };
    }
    if (url.pathname.endsWith("/challenge")) {
      challengeCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return {
        ok: true,
        status: 200,
        payload: {
          sessionId: SESSION_A,
          challengeId: CHALLENGE_A,
          nonce: "shared",
          difficultyBits: 0,
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
          version: 1,
        },
      };
    }
    if (url.pathname.endsWith("/verify")) {
      verifyCalls += 1;
      return {
        ok: true,
        status: 200,
        payload: { ok: true, sessionId: SESSION_A, verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800 },
      };
    }
    const key = url.searchParams.get("q");
    const count = (perQueryCalls.get(key) || 0) + 1;
    perQueryCalls.set(key, count);
    return count === 1
      ? { ok: false, status: 403, payload: { code: "CHALLENGE_REQUIRED", sessionId: SESSION_A } }
      : { ok: true, status: 200, payload: { key } };
  };

  const results = await Promise.all(Array.from({ length: 10 }, (_, index) => (
    guardedGet(`https://siatube.com/api/search?q=${index}`, { send })
  )));
  assert.equal(results.length, 10);
  assert.equal(challengeCalls, 1);
  assert.equal(verifyCalls, 1);
});

test("challenge response replaces an expired server-side session", async (t) => {
  installStorage(t);
  acceptReturnedSession({ sessionId: SESSION_A });
  let challengeSid = null;
  const send = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/status")) {
      return { ok: true, status: 200, payload: { verified: false, sessionId: SESSION_A } };
    }
    if (url.pathname.endsWith("/challenge")) {
      challengeSid = url.searchParams.get("guard_sid");
      return {
        ok: true,
        status: 200,
        payload: {
          sessionId: SESSION_B,
          challengeId: CHALLENGE_A,
          nonce: "new-session",
          difficultyBits: 0,
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
          version: 1,
        },
      };
    }
    assert.equal(url.pathname.endsWith("/verify"), true);
    assert.equal(url.searchParams.get("guard_sid"), SESSION_B);
    return {
      ok: true,
      status: 200,
      payload: { ok: true, sessionId: SESSION_B, verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800 },
    };
  };
  await ensureGuardChallenge({ send });
  assert.equal(challengeSid, SESSION_A);
  assert.equal(loadGuardSession().sessionId, SESSION_B);
});

test("an expired verification restarts the challenge only once", async (t) => {
  installStorage(t);
  acceptReturnedSession({ sessionId: SESSION_A });
  let challengeCalls = 0;
  let verifyCalls = 0;
  const send = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/status")) {
      return { ok: true, status: 200, payload: { verified: false, sessionId: SESSION_A } };
    }
    if (url.pathname.endsWith("/challenge")) {
      challengeCalls += 1;
      return {
        ok: true,
        status: 200,
        payload: {
          sessionId: SESSION_A,
          challengeId: CHALLENGE_A,
          nonce: `attempt-${challengeCalls}`,
          difficultyBits: 0,
          expiresAt: Math.floor(Date.now() / 1_000) + 60,
          version: 1,
        },
      };
    }
    verifyCalls += 1;
    return verifyCalls === 1
      ? { ok: false, status: 403, payload: { code: "CHALLENGE_EXPIRED", sessionId: SESSION_A } }
      : {
          ok: true,
          status: 200,
          payload: { ok: true, sessionId: SESSION_A, verifiedUntil: Math.floor(Date.now() / 1_000) + 1_800 },
        };
  };

  await ensureGuardChallenge({ send });
  assert.equal(challengeCalls, 2);
  assert.equal(verifyCalls, 2);
});

test("aborting proof of work cancels and terminates its Worker", async (t) => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = function Worker() {};
  t.after(() => {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  });
  const listeners = new Map();
  const messages = [];
  let terminated = false;
  const worker = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    postMessage: (message) => messages.push(message),
    terminate: () => { terminated = true; },
  };
  const controller = new AbortController();
  const pending = solveGuardChallenge({
    nonce: "abort",
    difficultyBits: 16,
    version: 1,
    expiresAt: Date.now() + 60_000,
  }, {
    signal: controller.signal,
    workerFactory: () => worker,
  });
  controller.abort("navigation");

  await assert.rejects(pending, { name: "AbortError", code: "ABORTED" });
  assert.equal(messages[0].nonce, "abort");
  assert.equal(messages[1].type, "cancel");
  assert.equal(terminated, true);
  assert.equal(listeners.size, 0);
});
