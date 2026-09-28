const URL_KEY = "requestProxyUrl";
const JSONP_KEY = "requestProxyJsonpEnabled";
const HEALTHCHECK_URL = "https://siatube.com/";
const HEALTH_KEY = "requestProxyHealth.v2";
const LEGACY_HEALTH_KEY = "requestProxyHealth.v1";
const FAILURE_KEY = "requestProxyLoadFailures.v1";
const HEALTH_TTL_MS = 24 * 60 * 60 * 1_000;
const RECOVERY_GUARANTEE_MS = 30 * 60 * 1_000;
const FAILURE_WINDOW_MS = 5 * 60 * 1_000;
const FAILURE_THRESHOLD = 2;
const CHECK_TIMEOUT_MS = 15_000;
const JSONP_CALLBACK_GRACE_MS = 5 * 60 * 1_000;
const MAX_STORED_URLS = 5;
const HEALTH_EVENT = "request-proxy-health-change";
const CONFIG_EVENT = "request-proxy-config-change";

const inFlightChecks = new Map();
let jsonpCallbackSequence = 0;

function readStorage(storageName, key, fallback) {
  try {
    const storage = globalThis[storageName];
    if (!storage || typeof storage.getItem !== "function") return fallback;
    const value = storage.getItem(key);
    if (value === null) return fallback;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch {
    return fallback;
  }
}

function writeStorage(storageName, key, value) {
  try {
    const storage = globalThis[storageName];
    if (!storage || typeof storage.setItem !== "function") return;
    storage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`requestProxy: failed to save ${key}`, error);
  }
}

function removeStorage(storageName, key) {
  try {
    const storage = globalThis[storageName];
    storage?.removeItem?.(key);
  } catch (error) {
    console.error(`requestProxy: failed to remove ${key}`, error);
  }
}

function read(key, fallback) {
  return readStorage("localStorage", key, fallback);
}

function write(key, value) {
  writeStorage("localStorage", key, value);
}

function resolveNow(now) {
  const value = typeof now === "function" ? now() : now;
  return Number.isFinite(value) ? value : Date.now();
}

export function loadRequestProxy() {
  return {
    url: String(read(URL_KEY, "") || "").trim(),
  };
}

export function saveRequestProxy(url) {
  const normalized = normalizeRequestProxyUrl(url);
  write(URL_KEY, normalized);
  return normalized;
}

export function loadRequestProxyJsonp() {
  return read(JSONP_KEY, false) === true;
}

export function saveRequestProxyJsonp(enabled) {
  const value = enabled === true;
  write(JSONP_KEY, value);
  emitConfigState({ jsonpEnabled: value });
  return value;
}

export function requestProxyTransport(jsonpEnabled = loadRequestProxyJsonp()) {
  return jsonpEnabled === true ? "jsonp" : "fetch";
}

function normalizeTransport(transport) {
  return transport === "jsonp" ? "jsonp" : "fetch";
}

function proxyStateKey(url, transport) {
  return `${normalizeTransport(transport)}:${url}`;
}

export function normalizeRequestProxyUrl(value) {
  const proxyUrl = String(value || "").trim();
  if (!proxyUrl) return "";

  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new TypeError("Proxy URL must be a valid HTTP(S) URL");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new TypeError("Proxy URL must be a valid HTTP(S) URL");
  }
  if (parsed.username || parsed.password) {
    throw new TypeError("Proxy URL must not contain credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new TypeError("Proxy URL must not contain a query string or fragment");
  }

  // Accept a harmless trailing delimiter without producing `??url=`/`#?url=`.
  return proxyUrl.replace(/[?#]+$/, "");
}

function normalizeHealthEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  let url;
  try {
    url = normalizeRequestProxyUrl(entry.url);
  } catch {
    return null;
  }

  const checkedAt = Number(entry.checkedAt);
  const expiresAt = Number(entry.expiresAt);
  const guaranteedUntil = Number(entry.guaranteedUntil) || 0;
  if (
    !url ||
    !["success", "error"].includes(entry.status) ||
    !Number.isFinite(checkedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= checkedAt
  ) {
    return null;
  }

  return {
    url,
    transport: normalizeTransport(entry.transport),
    status: entry.status,
    checkedAt,
    expiresAt,
    guaranteedUntil: Number.isFinite(guaranteedUntil) ? guaranteedUntil : 0,
    reason: typeof entry.reason === "string" ? entry.reason : "",
  };
}

function readHealthEntries() {
  const stored = read(HEALTH_KEY, null);
  if (!stored) {
    // v1 marked direct-payload GAS responses as invalid JSONP. Discard it so
    // affected proxy URLs are checked again immediately after this update.
    removeStorage("localStorage", LEGACY_HEALTH_KEY);
    return [];
  }
  if (stored.version !== 2 || !Array.isArray(stored.entries)) return [];
  return stored.entries.map(normalizeHealthEntry).filter(Boolean);
}

function writeHealthEntries(entries) {
  if (!entries.length) {
    removeStorage("localStorage", HEALTH_KEY);
    return;
  }
  write(HEALTH_KEY, { version: 2, entries: entries.slice(0, MAX_STORED_URLS) });
}

function saveHealthEntry(state) {
  const entries = readHealthEntries()
    .filter((entry) => (
      proxyStateKey(entry.url, entry.transport) !==
        proxyStateKey(state.url, state.transport) &&
      entry.expiresAt > state.checkedAt
    ));
  entries.unshift(state);
  entries.sort((a, b) => b.checkedAt - a.checkedAt);
  writeHealthEntries(entries);
  return state;
}

function emitHealthState(state) {
  try {
    const target = globalThis.window;
    const CustomEventConstructor = target?.CustomEvent || globalThis.CustomEvent;
    if (
      !target ||
      typeof target.dispatchEvent !== "function" ||
      typeof CustomEventConstructor !== "function"
    ) {
      return;
    }
    target.dispatchEvent(new CustomEventConstructor(HEALTH_EVENT, { detail: state }));
  } catch {
    // Health persistence and requests must keep working without DOM events.
  }
}

function emitConfigState(state) {
  try {
    const target = globalThis.window;
    const CustomEventConstructor = target?.CustomEvent || globalThis.CustomEvent;
    if (
      !target ||
      typeof target.dispatchEvent !== "function" ||
      typeof CustomEventConstructor !== "function"
    ) {
      return;
    }
    target.dispatchEvent(new CustomEventConstructor(CONFIG_EVENT, { detail: state }));
  } catch {
    // The setting is already persisted even if same-tab notification is unavailable.
  }
}

/** Return the unexpired cached result for this exact proxy URL and transport. */
export function loadRequestProxyHealth(
  proxyUrl,
  { now, transport = requestProxyTransport() } = {},
) {
  let normalizedProxyUrl;
  try {
    normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  } catch {
    return null;
  }
  if (!normalizedProxyUrl) return null;

  const timestamp = resolveNow(now);
  const normalizedTransport = normalizeTransport(transport);
  const entry = readHealthEntries().find((entry) => (
    proxyStateKey(entry.url, entry.transport) ===
      proxyStateKey(normalizedProxyUrl, normalizedTransport)
  ));
  return entry && entry.expiresAt > timestamp ? { ...entry } : null;
}

export function clearRequestProxyHealth(proxyUrl, options = {}) {
  let normalizedProxyUrl;
  try {
    normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  } catch {
    return;
  }
  if (!normalizedProxyUrl) return;
  const hasTransport = Object.prototype.hasOwnProperty.call(options, "transport");
  const transport = normalizeTransport(options.transport);
  writeHealthEntries(readHealthEntries().filter((entry) => (
    entry.url !== normalizedProxyUrl ||
    (hasTransport && entry.transport !== transport)
  )));
}

/**
 * Convert an HTTP(S) request URL to `<proxy URL>?url=<encoded request URL>`.
 * Relative and non-network request URLs are deliberately left untouched.
 * An invalid configured proxy throws so a direct request is never made by mistake.
 */
export function proxiedRequestUrl(requestUrl, settings = loadRequestProxy()) {
  const original = typeof requestUrl === "string" ? requestUrl : requestUrl?.toString?.();
  if (!original) return original;

  const proxyValue = typeof settings === "string" ? settings : settings?.url;
  if (!String(proxyValue || "").trim()) return original;

  try {
    const target = new URL(original);
    if (!["http:", "https:"].includes(target.protocol)) return original;
  } catch {
    return original;
  }

  const proxyUrl = normalizeRequestProxyUrl(proxyValue);
  return `${proxyUrl}?url=${encodeURIComponent(original)}`;
}

/** Build `<proxy>?callback=<name>&url=<encoded target>` for JSONP requests. */
export function jsonpRequestUrl(requestUrl, proxyUrl, callbackName) {
  const normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  if (!normalizedProxyUrl) throw new TypeError("Proxy URL is required");

  const original = typeof requestUrl === "string"
    ? requestUrl
    : requestUrl?.toString?.();
  let target;
  try {
    target = new URL(original);
  } catch {
    throw new TypeError("JSONP target must be a valid HTTP(S) URL");
  }
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new TypeError("JSONP target must be a valid HTTP(S) URL");
  }

  const callback = String(callbackName || "");
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    throw new TypeError("JSONP callback must be a valid JavaScript identifier");
  }

  return `${normalizedProxyUrl}?callback=${encodeURIComponent(callback)}` +
    `&url=${encodeURIComponent(original)}`;
}

function jsonpError(message, code, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function jsonpAbortError(signal) {
  const error = jsonpError("JSONP request was aborted", "ABORTED", signal?.reason);
  error.name = "AbortError";
  return error;
}

function nextJsonpCallbackName(callbackTarget) {
  let callbackName;
  do {
    jsonpCallbackSequence += 1;
    callbackName = `__siatubeJsonp_${Date.now().toString(36)}_` +
      jsonpCallbackSequence.toString(36);
  } while (Object.prototype.hasOwnProperty.call(callbackTarget, callbackName));
  return callbackName;
}

function normalizeJsonpResponse(result) {
  const isObject = result !== null && typeof result === "object";
  const hasOk = isObject && Object.prototype.hasOwnProperty.call(result, "ok");
  const hasStatus = isObject && Object.prototype.hasOwnProperty.call(result, "status");

  // Support the documented `{ ok, status, data }` proxy response.
  if (hasOk && hasStatus) {
    const status = Number(result.status);
    if (
      typeof result.ok !== "boolean" ||
      !Number.isFinite(status) ||
      (result.ok && !Object.prototype.hasOwnProperty.call(result, "data"))
    ) {
      throw jsonpError("Proxy returned an invalid JSONP response", "INVALID_JSON");
    }
    return { ...result, status };
  }

  // Some GAS deployments return the fetched JSON directly after their 302
  // redirect (`callback(<SiaTube JSON>)`). Normalize that form to the same
  // internal envelope so API callers can consistently consume `data`.
  const valueType = typeof result;
  const isJsonValue = result === null || isObject ||
    valueType === "string" || valueType === "boolean" ||
    (valueType === "number" && Number.isFinite(result));
  if (!isJsonValue) {
    throw jsonpError("Proxy returned an invalid JSONP response", "INVALID_JSON");
  }
  return { ok: true, status: 200, data: result };
}

/** Load a JSONP proxy response through a temporary script element. */
export function requestProxyJsonp(
  requestUrl,
  {
    proxyUrl = loadRequestProxy().url,
    signal,
    documentRef = globalThis.document,
    callbackTarget = globalThis.window || globalThis,
  } = {},
) {
  if (signal?.aborted) return Promise.reject(jsonpAbortError(signal));
  if (
    !documentRef ||
    typeof documentRef.createElement !== "function" ||
    !callbackTarget
  ) {
    return Promise.reject(jsonpError(
      "JSONP is not available in this environment",
      "NETWORK_ERROR",
    ));
  }

  const host = documentRef.head || documentRef.body || documentRef.documentElement;
  if (!host || typeof host.appendChild !== "function") {
    return Promise.reject(jsonpError(
      "JSONP script cannot be attached to the document",
      "NETWORK_ERROR",
    ));
  }

  const callbackName = nextJsonpCallbackName(callbackTarget);
  let sourceUrl;
  try {
    sourceUrl = jsonpRequestUrl(requestUrl, proxyUrl, callbackName);
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise((resolve, reject) => {
    const script = documentRef.createElement("script");
    let settled = false;
    let tombstoneTimer = null;

    const removeOwnedCallback = (ownedCallback) => {
      try {
        if (callbackTarget[callbackName] !== ownedCallback) return;
        delete callbackTarget[callbackName];
      } catch {
        try {
          if (callbackTarget[callbackName] === ownedCallback) {
            callbackTarget[callbackName] = undefined;
          }
        } catch {}
      }
    };
    const removeScript = () => {
      try {
        if (typeof script.remove === "function") script.remove();
        else script.parentNode?.removeChild?.(script);
      } catch {}
    };

    let callbackHandler;

    const cleanup = ({ keepCallbackAlive = false } = {}) => {
      signal?.removeEventListener?.("abort", onAbort);

      if (keepCallbackAlive) {
        // Removing an already prepared async script does not guarantee that the
        // browser will stop executing it. Keep a harmless callback until its
        // delayed load/error event (or a bounded grace period) so an aborted
        // JSONP response cannot raise a global ReferenceError.
        const tombstone = () => {};
        let ownedCallback = callbackHandler;
        try {
          callbackTarget[callbackName] = tombstone;
          ownedCallback = tombstone;
        } catch {
          // The original handler is also safe after `settled` becomes true.
        }
        const releaseTombstone = () => {
          if (tombstoneTimer !== null) {
            clearTimeout(tombstoneTimer);
            tombstoneTimer = null;
          }
          script.onload = null;
          script.onerror = null;
          removeOwnedCallback(ownedCallback);
        };
        script.onload = releaseTombstone;
        script.onerror = releaseTombstone;
        tombstoneTimer = setTimeout(releaseTombstone, JSONP_CALLBACK_GRACE_MS);
        tombstoneTimer?.unref?.();
        removeScript();
        return;
      }

      script.onload = null;
      script.onerror = null;
      removeScript();
      removeOwnedCallback(callbackHandler);
    };
    const settle = (handler, value, cleanupOptions) => {
      if (settled) return;
      settled = true;
      cleanup(cleanupOptions);
      handler(value);
    };
    const onAbort = () => settle(reject, jsonpAbortError(signal), {
      keepCallbackAlive: true,
    });

    callbackHandler = (result) => {
      try {
        settle(resolve, normalizeJsonpResponse(result));
      } catch (error) {
        settle(reject, error);
      }
    };
    callbackTarget[callbackName] = callbackHandler;
    script.async = true;
    script.src = sourceUrl;
    script.onerror = (event) => settle(reject, jsonpError(
      "Failed to load the JSONP proxy response",
      "NETWORK_ERROR",
      event,
    ));
    script.onload = () => {
      if (!settled) {
        settle(reject, jsonpError(
          "JSONP script loaded without calling its callback",
          "INVALID_JSON",
        ));
      }
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });

    try {
      host.appendChild(script);
    } catch (error) {
      settle(reject, jsonpError(
        "Failed to attach the JSONP proxy script",
        "NETWORK_ERROR",
        error,
      ));
    }
  });
}

export async function checkRequestProxy(
  proxyUrl,
  {
    fetchImpl = globalThis.fetch,
    jsonpRequestImpl = requestProxyJsonp,
    signal,
    transport = requestProxyTransport(),
  } = {},
) {
  const normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  if (!normalizedProxyUrl) {
    throw new TypeError("Proxy URL is required");
  }
  const normalizedTransport = normalizeTransport(transport);
  let payload;

  if (normalizedTransport === "jsonp") {
    if (typeof jsonpRequestImpl !== "function") {
      throw new TypeError("JSONP request is not available");
    }
    const result = await jsonpRequestImpl(HEALTHCHECK_URL, {
      proxyUrl: normalizedProxyUrl,
      signal,
    });
    const status = Number(result?.status);
    if (!result?.ok || status < 200 || status >= 300) {
      throw new Error(
        result?.error || `Proxy check failed with HTTP ${
          Number.isFinite(status) ? status : "unknown"
        }`,
      );
    }
    payload = result.data;
  } else {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetch is not available");
    }
    const response = await fetchImpl(
      proxiedRequestUrl(HEALTHCHECK_URL, { url: normalizedProxyUrl }),
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        redirect: "follow",
        signal,
      },
    );

    if (!response?.ok) {
      throw new Error(`Proxy check failed with HTTP ${response?.status ?? "unknown"}`);
    }
    try {
      payload = await response.json();
    } catch (cause) {
      const error = new Error("Proxy check returned invalid JSON");
      error.cause = cause;
      throw error;
    }
  }

  try {
    if (
      payload === null ||
      typeof payload !== "object" ||
      typeof payload.status !== "string" ||
      !payload.status.trim() ||
      payload.error
    ) {
      throw new TypeError("Proxy check JSON must contain a valid status");
    }
    return payload;
  } catch (cause) {
    if (cause?.message === "Proxy check returned invalid JSON") throw cause;
    const error = new Error("Proxy check returned invalid JSON");
    error.cause = cause;
    throw error;
  }
}

/**
 * Restore a fresh URL-scoped result, or perform one shared health check.
 * Both successful and failed checks are retained for 24 hours.
 */
export function ensureRequestProxyHealth(
  proxyUrl,
  {
    fetchImpl = globalThis.fetch,
    jsonpRequestImpl = requestProxyJsonp,
    force = false,
    recovery = false,
    reason = "settings",
    now,
    timeoutMs = CHECK_TIMEOUT_MS,
    transport = requestProxyTransport(),
  } = {},
) {
  const normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  if (!normalizedProxyUrl) return Promise.reject(new TypeError("Proxy URL is required"));
  const normalizedTransport = normalizeTransport(transport);
  const stateKey = proxyStateKey(normalizedProxyUrl, normalizedTransport);

  if (!force) {
    const cached = loadRequestProxyHealth(normalizedProxyUrl, {
      now,
      transport: normalizedTransport,
    });
    if (cached) return Promise.resolve(cached);
  }

  const existing = inFlightChecks.get(stateKey);
  if (existing) {
    if (recovery) {
      existing.recovery = true;
      existing.reason = reason;
    }
    return existing.promise;
  }

  const flight = {
    recovery: recovery === true,
    reason,
    promise: null,
  };

  flight.promise = (async () => {
    const previous = loadRequestProxyHealth(normalizedProxyUrl, {
      now,
      transport: normalizedTransport,
    });
    emitHealthState({
      url: normalizedProxyUrl,
      transport: normalizedTransport,
      status: "checking",
      reason: flight.reason,
    });

    const controller = new AbortController();
    let timeoutId = null;
    let status = "success";

    try {
      const checkPromise = checkRequestProxy(normalizedProxyUrl, {
        fetchImpl,
        jsonpRequestImpl,
        signal: controller.signal,
        transport: normalizedTransport,
      });
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error("Proxy check timed out"));
          }, timeoutMs);
        });
        await Promise.race([checkPromise, timeoutPromise]);
      } else {
        await checkPromise;
      }
    } catch {
      status = "error";
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }

    const checkedAt = resolveNow(now);
    const previousGuarantee = previous?.guaranteedUntil > checkedAt
      ? previous.guaranteedUntil
      : 0;
    const state = saveHealthEntry({
      url: normalizedProxyUrl,
      transport: normalizedTransport,
      status,
      checkedAt,
      expiresAt: checkedAt + HEALTH_TTL_MS,
      guaranteedUntil: status === "success"
        ? Math.max(
          previousGuarantee,
          flight.recovery ? checkedAt + RECOVERY_GUARANTEE_MS : 0,
        )
        : 0,
      reason: flight.reason,
    });
    clearRequestProxyFailures(normalizedProxyUrl, normalizedTransport);
    emitHealthState(state);
    return { ...state };
  })().finally(() => {
    if (inFlightChecks.get(stateKey) === flight) {
      inFlightChecks.delete(stateKey);
    }
  });

  inFlightChecks.set(stateKey, flight);
  return flight.promise;
}

function normalizeFailureEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  let url;
  try {
    url = normalizeRequestProxyUrl(entry.url);
  } catch {
    return null;
  }
  const count = Number(entry.count);
  const firstFailureAt = Number(entry.firstFailureAt);
  const lastFailureAt = Number(entry.lastFailureAt);
  if (
    !url ||
    !Number.isInteger(count) ||
    count < 1 ||
    !Number.isFinite(firstFailureAt) ||
    !Number.isFinite(lastFailureAt)
  ) {
    return null;
  }
  return {
    url,
    transport: normalizeTransport(entry.transport),
    count,
    firstFailureAt,
    lastFailureAt,
  };
}

function readFailureEntries() {
  const stored = readStorage("sessionStorage", FAILURE_KEY, null);
  if (!stored || stored.version !== 1 || !Array.isArray(stored.entries)) return [];
  return stored.entries.map(normalizeFailureEntry).filter(Boolean);
}

function writeFailureEntries(entries) {
  if (!entries.length) {
    removeStorage("sessionStorage", FAILURE_KEY);
    return;
  }
  writeStorage("sessionStorage", FAILURE_KEY, {
    version: 1,
    entries: entries.slice(0, MAX_STORED_URLS),
  });
}

function saveFailureEntry(state) {
  const entries = readFailureEntries().filter((entry) => (
    proxyStateKey(entry.url, entry.transport) !==
      proxyStateKey(state.url, state.transport)
  ));
  entries.unshift(state);
  entries.sort((a, b) => b.lastFailureAt - a.lastFailureAt);
  writeFailureEntries(entries);
}

function clearRequestProxyFailures(proxyUrl, transport) {
  const hasTransport = transport !== undefined;
  const normalizedTransport = normalizeTransport(transport);
  writeFailureEntries(readFailureEntries().filter((entry) => (
    entry.url !== proxyUrl ||
    (hasTransport && entry.transport !== normalizedTransport)
  )));
}

export function isRequestProxyLoadFailure(error) {
  if (!error || typeof error !== "object") return false;
  const status = Number(error.status);
  if (status === 408 || status >= 500) return true;
  return ["NETWORK_ERROR", "TIMEOUT", "INVALID_JSON"].includes(error.code);
}

/** A successful proxied JSON page request breaks a run of load failures. */
export function recordRequestProxyLoadSuccess(
  proxyUrl,
  { transport = requestProxyTransport() } = {},
) {
  try {
    const normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
    if (normalizedProxyUrl) {
      clearRequestProxyFailures(
        normalizedProxyUrl,
        normalizeTransport(transport),
      );
    }
  } catch {
    // Failure accounting must never change the request result.
  }
}

/**
 * Two qualifying logical page-load failures within five minutes invalidate the
 * cached result and trigger one shared recovery check. Recovery success is
 * protected from further automatic checks for 30 minutes.
 */
export function recordRequestProxyLoadFailure(
  proxyUrl,
  {
    error,
    now,
    fetchImpl = globalThis.fetch,
    jsonpRequestImpl = requestProxyJsonp,
    timeoutMs = CHECK_TIMEOUT_MS,
    transport = requestProxyTransport(),
  } = {},
) {
  let normalizedProxyUrl;
  try {
    normalizedProxyUrl = normalizeRequestProxyUrl(proxyUrl);
  } catch {
    return Promise.resolve(null);
  }
  if (!normalizedProxyUrl || !isRequestProxyLoadFailure(error)) {
    return Promise.resolve(null);
  }
  const normalizedTransport = normalizeTransport(transport);
  const stateKey = proxyStateKey(normalizedProxyUrl, normalizedTransport);

  const timestamp = resolveNow(now);
  const health = loadRequestProxyHealth(normalizedProxyUrl, {
    now: timestamp,
    transport: normalizedTransport,
  });
  if (
    health?.status === "success" &&
    health.guaranteedUntil > timestamp
  ) {
    clearRequestProxyFailures(normalizedProxyUrl, normalizedTransport);
    return Promise.resolve(health);
  }

  const activeCheck = inFlightChecks.get(stateKey);
  if (activeCheck?.recovery) return activeCheck.promise;

  const previous = readFailureEntries().find((entry) => (
    proxyStateKey(entry.url, entry.transport) === stateKey
  ));
  const withinWindow = previous &&
    timestamp >= previous.firstFailureAt &&
    timestamp - previous.firstFailureAt < FAILURE_WINDOW_MS;
  const failure = withinWindow
    ? {
      ...previous,
      count: previous.count + 1,
      lastFailureAt: timestamp,
    }
    : {
      url: normalizedProxyUrl,
      transport: normalizedTransport,
      count: 1,
      firstFailureAt: timestamp,
      lastFailureAt: timestamp,
    };
  saveFailureEntry(failure);

  if (failure.count < FAILURE_THRESHOLD) return Promise.resolve(null);

  clearRequestProxyFailures(normalizedProxyUrl, normalizedTransport);
  clearRequestProxyHealth(normalizedProxyUrl, {
    transport: normalizedTransport,
  });
  return ensureRequestProxyHealth(normalizedProxyUrl, {
    fetchImpl,
    jsonpRequestImpl,
    force: true,
    recovery: true,
    reason: "load-errors",
    now,
    timeoutMs,
    transport: normalizedTransport,
  });
}

export {
  CHECK_TIMEOUT_MS as REQUEST_PROXY_CHECK_TIMEOUT_MS,
  CONFIG_EVENT as REQUEST_PROXY_CONFIG_EVENT,
  FAILURE_KEY as REQUEST_PROXY_FAILURE_KEY,
  FAILURE_THRESHOLD as REQUEST_PROXY_FAILURE_THRESHOLD,
  FAILURE_WINDOW_MS as REQUEST_PROXY_FAILURE_WINDOW_MS,
  HEALTH_EVENT as REQUEST_PROXY_HEALTH_EVENT,
  HEALTH_KEY as REQUEST_PROXY_HEALTH_KEY,
  HEALTH_TTL_MS as REQUEST_PROXY_HEALTH_TTL_MS,
  HEALTHCHECK_URL as REQUEST_PROXY_HEALTHCHECK_URL,
  JSONP_KEY as REQUEST_PROXY_JSONP_KEY,
  RECOVERY_GUARANTEE_MS as REQUEST_PROXY_RECOVERY_GUARANTEE_MS,
  URL_KEY as REQUEST_PROXY_URL_KEY,
};
