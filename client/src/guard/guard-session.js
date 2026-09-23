export const GUARD_SESSION_STORAGE_KEY = "siatube.guard.session.v1";
export const GUARD_SESSION_VERSION = 1;
export const GUARD_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
export const GUARD_CHANNEL_NAME = "siatube-guard-v1";

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RESERVED_PARAMETERS = ["guard_sid", "challenge_id", "counter"];
let memorySession = null;
let channel = null;

export function isValidGuardSessionId(value) {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

function normalizeSession(value, now = Date.now()) {
  if (!value || typeof value !== "object") return null;
  if (value.version !== GUARD_SESSION_VERSION) return null;
  if (!isValidGuardSessionId(value.sessionId)) return null;
  if (!Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
  return {
    version: GUARD_SESSION_VERSION,
    sessionId: value.sessionId,
    expiresAt: value.expiresAt,
    verifiedUntil: Number.isFinite(value.verifiedUntil) ? value.verifiedUntil : 0,
  };
}

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function removeStoredSession() {
  try {
    storage()?.removeItem?.(GUARD_SESSION_STORAGE_KEY);
  } catch {}
}

export function loadGuardSession(now = Date.now()) {
  let parsed = null;
  let hadStoredValue = false;
  let storageUnavailable = false;
  let storedValueInvalid = false;
  try {
    const raw = storage()?.getItem?.(GUARD_SESSION_STORAGE_KEY);
    hadStoredValue = raw !== null && raw !== undefined;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        storedValueInvalid = true;
      }
    }
  } catch {
    storageUnavailable = true;
  }

  const stored = normalizeSession(parsed, now);
  if (stored) {
    memorySession = stored;
    return { ...stored };
  }
  if (hadStoredValue || storedValueInvalid) {
    memorySession = null;
    if (!storageUnavailable) removeStoredSession();
    return null;
  }

  const fallback = normalizeSession(memorySession, now);
  if (!fallback) memorySession = null;
  return fallback ? { ...fallback } : null;
}

function broadcastSession(session) {
  try {
    channel?.postMessage(session);
  } catch {}
}

export function saveGuardSession(session, { broadcast = true } = {}) {
  const normalized = normalizeSession(session);
  if (!normalized) {
    clearGuardSession({ broadcast });
    return null;
  }
  memorySession = normalized;
  try {
    storage()?.setItem?.(GUARD_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  if (broadcast) broadcastSession(normalized);
  return { ...normalized };
}

export function clearGuardSession({ broadcast = true } = {}) {
  memorySession = null;
  removeStoredSession();
  if (broadcast) broadcastSession(null);
}

export function acceptReturnedSession(payload, {
  now = Date.now(),
  renew = false,
} = {}) {
  if (!payload || !isValidGuardSessionId(payload.sessionId)) return loadGuardSession(now);
  const current = loadGuardSession(now);
  const changed = current?.sessionId !== payload.sessionId;
  const verifiedUntil = Number(payload.verifiedUntil) * 1_000;
  return saveGuardSession({
    version: GUARD_SESSION_VERSION,
    sessionId: payload.sessionId,
    expiresAt: changed || renew || !current
      ? now + GUARD_SESSION_TTL_MS
      : current.expiresAt,
    verifiedUntil: Number.isFinite(verifiedUntil) && verifiedUntil > 0
      ? verifiedUntil
      : (changed ? 0 : current?.verifiedUntil || 0),
  });
}

function baseOrigin() {
  try {
    return globalThis.location?.origin || "https://siatube.com";
  } catch {
    return "https://siatube.com";
  }
}

export function withGuardSession(inputUrl, sessionId) {
  const url = new URL(inputUrl, baseOrigin());
  if (isValidGuardSessionId(sessionId)) url.searchParams.set("guard_sid", sessionId);
  else url.searchParams.delete("guard_sid");
  return url.toString();
}

export function redactGuardUrl(inputUrl) {
  try {
    const url = new URL(inputUrl, baseOrigin());
    for (const name of RESERVED_PARAMETERS) url.searchParams.delete(name);
    return url.toString();
  } catch {
    return "[invalid URL]";
  }
}

export function redactGuardPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const reserved = ["sessionId", "guard_sid", "challengeId", "challenge_id", "counter"];
  if (!reserved.some((name) => Object.prototype.hasOwnProperty.call(payload, name))) return payload;
  const redacted = { ...payload };
  for (const name of reserved) delete redacted[name];
  return redacted;
}

function initializeCrossTabSync() {
  if (typeof window === "undefined") return;
  try {
    window.addEventListener("storage", (event) => {
      if (event?.key !== GUARD_SESSION_STORAGE_KEY) return;
      if (!event.newValue) {
        memorySession = null;
        return;
      }
      try {
        memorySession = normalizeSession(JSON.parse(event.newValue));
      } catch {
        memorySession = null;
      }
    });
  } catch {}
  try {
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(GUARD_CHANNEL_NAME);
      channel.addEventListener("message", (event) => {
        const session = normalizeSession(event?.data);
        if (session) saveGuardSession(session, { broadcast: false });
        else clearGuardSession({ broadcast: false });
      });
    }
  } catch {}
}

initializeCrossTabSync();

export function __resetGuardSessionForTests() {
  memorySession = null;
  removeStoredSession();
}
