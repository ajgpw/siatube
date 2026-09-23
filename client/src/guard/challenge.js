import { proofMatches } from "./hash.js";
import {
  acceptReturnedSession,
  isValidGuardSessionId,
  loadGuardSession,
  withGuardSession,
} from "./guard-session.js";

const API_ORIGIN = "https://siatube.com";
const CHALLENGE_PATH = "/api/__guard/challenge";
const VERIFY_PATH = "/api/__guard/verify";
const STATUS_PATH = "/api/__guard/status";
const LOCK_NAME = "siatube-guard-challenge-v1";
const PROGRESS_EVENT = "siatube-guard-progress";
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
let challengePromise = null;
let requestSequence = 0;

export class GuardError extends Error {
  constructor(message, { code = "GUARD_ERROR", status = null, retryable = false, cause } = {}) {
    super(message);
    this.name = code === "ABORTED" ? "AbortError" : "GuardError";
    this.code = code;
    this.status = Number.isFinite(status) ? status : null;
    this.retryable = retryable;
    if (cause !== undefined) this.cause = cause;
  }
}

function guardErrorFromResponse(response, fallback) {
  const payload = response?.payload;
  const code = typeof payload?.code === "string" ? payload.code : fallback;
  const message = code === "RATE_LIMITED"
    ? "アクセスが集中しています。しばらく待ってから再試行してください。"
    : "接続の認証に失敗しました。もう一度お試しください。";
  return new GuardError(message, {
    code,
    status: response?.status,
    retryable: code === "INTERNAL_GUARD_ERROR",
  });
}

function abortError(signal) {
  return new GuardError("Request was aborted", {
    code: "ABORTED",
    cause: signal?.reason,
  });
}

function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal?.removeEventListener?.("abort", onAbort);
      callback(value);
    };
    const timer = setTimeout(() => finish(resolve), Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timer);
      finish(reject, abortError(signal));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function endpoint(path) {
  return new URL(path, API_ORIGIN).toString();
}

function updateFromResponse(response, options) {
  return acceptReturnedSession(response?.payload, options);
}

async function sendGuardRequest(send, url, signal) {
  let response;
  try {
    response = await send(url, { signal, cache: "no-store" });
  } catch (cause) {
    if (signal?.aborted || cause?.name === "AbortError" || cause?.code === "ABORTED") throw cause;
    throw new GuardError("接続の認証中に通信できませんでした。", {
      code: typeof cause?.code === "string" ? cause.code : "GUARD_NETWORK_ERROR",
      status: cause?.status,
      retryable: false,
    });
  }
  updateFromResponse(response);
  if (response.status === 429 && response.payload?.code === "RATE_LIMITED") {
    const seconds = Number(response.payload.retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      emitProgress("rate-limited", Math.ceil(seconds));
      await delay(seconds * 1_000 + Math.floor(Math.random() * 251), signal);
      try {
        response = await send(url, { signal, cache: "no-store" });
      } catch (cause) {
        if (signal?.aborted || cause?.name === "AbortError" || cause?.code === "ABORTED") throw cause;
        throw new GuardError("接続の認証中に通信できませんでした。", {
          code: typeof cause?.code === "string" ? cause.code : "GUARD_NETWORK_ERROR",
          status: cause?.status,
          retryable: false,
        });
      }
      updateFromResponse(response);
    }
  }
  return response;
}

function validateChallenge(response) {
  if (!response?.ok) throw guardErrorFromResponse(response, "CHALLENGE_FAILED");
  const payload = response.payload;
  const expiresAt = Number(payload?.expiresAt) * 1_000;
  if (
    !payload || payload.version !== 1 ||
    !isValidGuardSessionId(payload.sessionId) ||
    loadGuardSession()?.sessionId !== payload.sessionId ||
    !CHALLENGE_ID_PATTERN.test(payload.challengeId || "") ||
    typeof payload.nonce !== "string" || payload.nonce.length === 0 ||
    !Number.isInteger(payload.difficultyBits) ||
    payload.difficultyBits < 0 || payload.difficultyBits > 256 ||
    !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 2_000
  ) {
    throw new GuardError("接続の認証情報が正しくありません。", { code: "INVALID_CHALLENGE" });
  }
  return { ...payload, expiresAt };
}

function emitProgress(state, retryAfter = null) {
  try {
    if (typeof window !== "undefined" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { state, retryAfter } }));
    }
  } catch {}
}

async function solveOnMainThread(challenge, signal) {
  for (let counter = 0; counter <= Number.MAX_SAFE_INTEGER; counter += 1) {
    if ((counter & 4095) === 0) {
      if (signal?.aborted) throw abortError(signal);
      if (Date.now() >= challenge.expiresAt - 2_000) {
        throw new GuardError("Challenge expired before it could be solved", {
          code: "LOCAL_CHALLENGE_EXPIRED",
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (proofMatches(challenge.nonce, counter, challenge.difficultyBits, challenge.version)) {
      return counter;
    }
  }
  throw new GuardError("No valid proof could be found", { code: "COUNTER_EXHAUSTED" });
}

export async function solveGuardChallenge(challenge, {
  signal,
  workerFactory,
} = {}) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  if (typeof Worker !== "function") return solveOnMainThread(challenge, signal);
  if (!workerFactory) {
    const { createGuardWorker } = await import("./worker-factory.js");
    workerFactory = createGuardWorker;
  }
  if (signal?.aborted) throw abortError(signal);
  return new Promise((resolve, reject) => {
    const worker = workerFactory();
    const requestId = `${Date.now().toString(36)}-${(requestSequence += 1).toString(36)}`;
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
      worker.removeEventListener?.("message", onMessage);
      worker.removeEventListener?.("error", onError);
      worker.terminate?.();
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => {
      try { worker.postMessage({ type: "cancel", requestId }); } catch {}
      finish(reject, abortError(signal));
    };
    const onError = (event) => finish(reject, new GuardError("Proof of work failed", {
      code: "POW_FAILED",
      cause: event,
    }));
    const onMessage = (event) => {
      if (event?.data?.requestId !== requestId) return;
      if (Number.isSafeInteger(event.data.counter) && event.data.counter >= 0) {
        finish(resolve, event.data.counter);
      } else {
        finish(reject, new GuardError("Proof of work failed", {
          code: event.data.code || "POW_FAILED",
        }));
      }
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage({
      requestId,
      nonce: challenge.nonce,
      difficultyBits: challenge.difficultyBits,
      version: challenge.version,
      expiresAt: challenge.expiresAt,
    });
  });
}

async function fetchGuardStatus(send, signal) {
  const session = loadGuardSession();
  if (!session) return false;
  const response = await sendGuardRequest(
    send,
    withGuardSession(endpoint(STATUS_PATH), session.sessionId),
    signal,
  );
  updateFromResponse(response);
  return response.ok && response.payload?.verified === true;
}

async function runChallengeWithoutLock({ send, signal, solve = solveGuardChallenge }) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal?.aborted) throw abortError(signal);
    const current = loadGuardSession();
    const challengeUrl = withGuardSession(endpoint(CHALLENGE_PATH), current?.sessionId);
    const challengeResponse = await sendGuardRequest(send, challengeUrl, signal);
    updateFromResponse(challengeResponse, { renew: true });
    const challenge = validateChallenge(challengeResponse);
    const sessionId = loadGuardSession()?.sessionId;
    const counter = await solve(challenge, { signal });

    const verifyUrl = new URL(VERIFY_PATH, API_ORIGIN);
    verifyUrl.searchParams.set("guard_sid", sessionId);
    verifyUrl.searchParams.set("challenge_id", challenge.challengeId);
    verifyUrl.searchParams.set("counter", String(counter));
    const verifyResponse = await sendGuardRequest(send, verifyUrl.toString(), signal);
    updateFromResponse(verifyResponse);
    if (verifyResponse.ok && verifyResponse.payload?.ok === true) {
      const verifiedUntil = Number(verifyResponse.payload.verifiedUntil) * 1_000;
      if (
        !isValidGuardSessionId(verifyResponse.payload.sessionId) ||
        !Number.isFinite(verifiedUntil) || verifiedUntil <= Date.now()
      ) {
        throw new GuardError("接続の認証結果が正しくありません。", {
          code: "INVALID_VERIFY_RESPONSE",
        });
      }
      acceptReturnedSession(verifyResponse.payload);
      return;
    }
    if (verifyResponse.payload?.code !== "CHALLENGE_EXPIRED" || attempt === 1) {
      throw guardErrorFromResponse(verifyResponse, "VERIFY_FAILED");
    }
  }
}

async function runChallenge(options) {
  const progressTimer = setTimeout(() => emitProgress("working"), 250);
  try {
    const locks = globalThis.navigator?.locks;
    if (locks && typeof locks.request === "function") {
      await locks.request(LOCK_NAME, async () => {
        if (!(await fetchGuardStatus(options.send, options.signal))) {
          await runChallengeWithoutLock(options);
        }
      });
    } else {
      await runChallengeWithoutLock(options);
    }
  } finally {
    clearTimeout(progressTimer);
    emitProgress("idle");
  }
}

export function ensureGuardChallenge(options) {
  if (challengePromise) return challengePromise;
  challengePromise = runChallenge(options).finally(() => {
    challengePromise = null;
  });
  return challengePromise;
}

export { PROGRESS_EVENT as GUARD_PROGRESS_EVENT };

export function __resetChallengeForTests() {
  challengePromise = null;
}
