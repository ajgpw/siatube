import { SIATUBE_API_ORIGIN } from "../api.js";
import { guardedGet } from "../guard/guarded-request.js";
import { redactGuardPayload, redactGuardUrl } from "../guard/guard-session.js";
import { loadDisableTimeouts } from "../utils/settingsManager.js";
import {
  isRequestProxyLoadFailure,
  loadRequestProxy,
  loadRequestProxyJsonp,
  proxiedRequestUrl,
  recordRequestProxyLoadFailure,
  recordRequestProxyLoadSuccess,
  requestProxyJsonp,
  requestProxyTransport,
} from "../utils/requestProxy.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 250;
const STREAM_CACHE_TTL_MS = 5 * 60 * 1_000;
export const API_CONNECTION_FAILURE_EVENT = "siatube-api-connection-failure";
export const VIDEO_STREAM_ERROR_CODES = new Set([
  "members_only",
  "private",
  "deleted",
  "copyright_removed",
  "account_terminated",
  "unavailable",
  "premiere_scheduled",
]);
const API_HEALTH_URL = `${SIATUBE_API_ORIGIN}/health`;
const API_HEALTH_TIMEOUT_MS = 10_000;

const streamCache = new Map();
const streamRequests = new Map();
let apiHealthProbe = null;

function confirmDirectApiBlock(error) {
  if (typeof window === "undefined" || apiHealthProbe) return;

  apiHealthProbe = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_HEALTH_TIMEOUT_MS);
    let receivedJson = false;

    try {
      const response = await fetch(API_HEALTH_URL, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json();
      receivedJson = response.ok && payload !== null && typeof payload === "object";
    } catch {
      receivedJson = false;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!receivedJson) {
      try {
        window.dispatchEvent(new CustomEvent(API_CONNECTION_FAILURE_EVENT, {
          detail: { error, healthUrl: API_HEALTH_URL, healthJsonReceived: false },
        }));
      } catch {}
    }
  })().finally(() => {
    apiHealthProbe = null;
  });
}

function pruneStreamCache(now = Date.now()) {
  for (const [key, entry] of streamCache) {
    if (!entry || now - entry.createdAt >= STREAM_CACHE_TTL_MS) {
      streamCache.delete(key);
    }
  }
}

export class SiaTubeApiError extends Error {
  constructor(message, details = {}) {
    super(message || "SiaTube API request failed");
    this.name = "SiaTubeApiError";
    this.code = details.code || "SIATUBE_API_ERROR";
    this.status = Number.isFinite(details.status) ? details.status : null;
    this.url = details.url || null;
    this.payload = details.payload ?? null;
    this.unavailable = details.unavailable === true;
    this.retryable = details.retryable === true;
    this.proxyUsed = details.proxyUsed === true;
    this.proxyUrl = details.proxyUrl || null;
    this.proxyTransport = details.proxyTransport || null;
    this.connectionFailure = details.connectionFailure === true;
    if (details.cause !== undefined) this.cause = details.cause;
  }
}

function validationError(message) {
  return new SiaTubeApiError(message, {
    code: "VALIDATION_ERROR",
    retryable: false,
  });
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw validationError(`${name} is required`);
  }
  return value.trim();
}

function pathSegment(value, name) {
  return encodeURIComponent(requireString(value, name));
}

function booleanQuery(value) {
  return value === true ? "true" : undefined;
}

function requestOptions(options = {}) {
  const result = {};
  for (const key of ["timeout", "retries", "signal", "headers", "cache"]) {
    if (options[key] !== undefined) result[key] = options[key];
  }
  return result;
}

function buildUrl(path, query = {}) {
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw validationError("API path must start with '/'");
  }

  const url = new URL(path, `${SIATUBE_API_ORIGIN}/`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          url.searchParams.append(key, String(item));
        }
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function normalizeTimeout(value) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw validationError("timeout must be a non-negative number");
  }
  return parsed;
}

function normalizeRetries(value) {
  if (value === undefined) return DEFAULT_RETRIES;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw validationError("retries must be a non-negative integer");
  }
  return parsed;
}

function abortError(signal, url = null) {
  const error = new SiaTubeApiError("Request was aborted", {
    code: "ABORTED",
    url,
    cause: signal?.reason,
    retryable: false,
  });
  // Preserve the platform convention used by existing AbortSignal consumers.
  error.name = "AbortError";
  return error;
}

function timeoutError(timeout, url) {
  return new SiaTubeApiError(`Request timed out after ${timeout}ms`, {
    code: "TIMEOUT",
    url,
    retryable: true,
  });
}

function errorMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.reason === "string" && payload.reason.trim()) {
      return payload.reason;
    }
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error;
    }
  }
  return fallback;
}

function errorCode(payload, fallback) {
  if (payload && typeof payload.code === "string" && payload.code.trim()) {
    return payload.code;
  }
  if (payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

export function isVideoStreamError(error) {
  return VIDEO_STREAM_ERROR_CODES.has(error?.code);
}

async function readJson(response, url) {
  try {
    if (typeof response.json === "function") return await response.json();
    if (typeof response.text === "function") {
      const text = await response.text();
      return JSON.parse(text);
    }
    throw new Error("Response does not expose a JSON body reader");
  } catch (cause) {
    const status = Number(response?.status) || null;
    const ok = response?.ok ?? (status !== null && status >= 200 && status < 300);
    if (!ok) {
      throw new SiaTubeApiError(
        status === null ? "SiaTube API request failed" : `SiaTube API returned HTTP ${status}`,
        {
          code: "HTTP_ERROR",
          status,
          url,
          retryable: status === null || status === 408 || status === 429 || status >= 500,
        },
      );
    }
    throw new SiaTubeApiError("SiaTube API returned invalid JSON", {
      code: "INVALID_JSON",
      status,
      url,
      retryable: true,
    });
  }
}

function validatePayload(payload, response, url) {
  const status = Number(response?.status) || null;
  const ok = response?.ok ?? (status !== null && status >= 200 && status < 300);
  const safePayload = redactGuardPayload(payload);

  if (!ok) {
    throw new SiaTubeApiError(
      errorMessage(
        safePayload,
        status === null ? "SiaTube API request failed" : `SiaTube API returned HTTP ${status}`,
      ),
      {
        code: errorCode(payload, "HTTP_ERROR"),
        status,
        url,
        payload: safePayload,
        retryable: status === null || status === 408 || status === 429 || status >= 500,
      },
    );
  }

  if (payload && typeof payload === "object" && payload.error) {
    throw new SiaTubeApiError(errorMessage(payload, "SiaTube API returned an error"), {
      code: errorCode(payload, "API_ERROR"),
      status,
      url,
      payload: safePayload,
      retryable: false,
    });
  }

  if (payload && typeof payload === "object" && payload.unavailable === true) {
    throw new SiaTubeApiError(errorMessage(payload, "This video is unavailable"), {
      code: "UNAVAILABLE",
      status,
      url,
      payload: safePayload,
      unavailable: true,
      retryable: false,
    });
  }

  return safePayload;
}

async function performGet(url, options, proxyUrl, proxyTransport) {
  if (proxyUrl && proxyTransport === "jsonp") {
    const result = await requestProxyJsonp(url, {
      proxyUrl,
      signal: options.signal,
    });
    let status = Number(result.status);
    const errorText = typeof result.error === "string" && result.error.trim()
      ? result.error
      : `JSONP proxy returned HTTP ${status}`;
    const payload = Object.prototype.hasOwnProperty.call(result, "data")
      ? result.data
      : { error: errorText };
    // Older GAS JSONP deployments return the upstream payload directly and
    // therefore lose the HTTP status. The guard code is unambiguous enough to
    // restore the documented status during that migration period.
    if (status === 200 && payload?.code === "CHALLENGE_REQUIRED") status = 403;
    if (status === 200 && payload?.code === "RATE_LIMITED") status = 429;
    const ok = result.ok === true && status >= 200 && status < 300;
    return {
      ok,
      status,
      payload,
      guardAction: null,
    };
  }
  const response = await fetch(proxiedRequestUrl(url, { url: proxyUrl }), options);
  return {
    ok: response.ok,
    status: response.status,
    payload: await readJson(response, redactGuardUrl(url)),
    guardAction: response.headers?.get?.("X-Guard-Action") || null,
  };
}

function finalizeRequestError(error, proxyUrl, proxyTransport) {
  const finalError = error instanceof SiaTubeApiError
    ? error
    : new SiaTubeApiError("Failed to reach the SiaTube API", {
      code: "NETWORK_ERROR",
      cause: error,
      retryable: true,
    });
  const proxyUsed = Boolean(proxyUrl);
  finalError.proxyUsed = proxyUsed;
  finalError.proxyUrl = proxyUsed ? proxyUrl : null;
  finalError.proxyTransport = proxyUsed ? proxyTransport : null;
  finalError.connectionFailure = isRequestProxyLoadFailure(finalError);

  if (finalError.connectionFailure) {
    finalError.originalMessage ||= finalError.message;
    finalError.message = proxyUsed
      ? proxyTransport === "jsonp"
        ? "JSONPプロキシ経由でしあtubeサーバーに接続できませんでした。JSONPまたはプロキシ設定を確認してください。"
        : "プロキシ経由でしあtubeサーバーに接続できませんでした。プロキシ設定またはネットワーク接続を確認してください。"
      : "しあtubeサーバーに接続できませんでした。ネットワーク接続を確認してください。";

    if (!proxyUsed) confirmDirectApiBlock(finalError);
  }

  if (proxyUsed) {
    void recordRequestProxyLoadFailure(proxyUrl, {
      error: finalError,
      transport: proxyTransport,
    }).catch(() => {});
  }
  return finalError;
}

function delay(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      reject(abortError(signal));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

/**
 * Perform a GET request against the configured SiaTube origin and parse JSON.
 */
export async function getJson(path, options = {}) {
  const {
    query = {},
    signal,
    headers = {},
    cache,
  } = options;
  let timeout = normalizeTimeout(options.timeout);
  try {
    if (loadDisableTimeouts()) timeout = 0;
  } catch {}
  const retries = normalizeRetries(options.retries);
  const url = buildUrl(path, query).toString();
  const safeUrl = redactGuardUrl(url);
  const proxyUrl = loadRequestProxy().url;
  const proxyTransport = requestProxyTransport(
    Boolean(proxyUrl) && loadRequestProxyJsonp(),
  );

  if (signal?.aborted) {
    throw finalizeRequestError(abortError(signal, safeUrl), proxyUrl, proxyTransport);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    let timeoutId = null;
    const onExternalAbort = () => controller.abort(signal?.reason);

    if (signal) signal.addEventListener("abort", onExternalAbort, { once: true });
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);
    }

    try {
      const send = (targetUrl, overrides = {}) => performGet(targetUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...headers,
        },
        credentials: "omit",
        redirect: "follow",
        ...(overrides.cache || cache ? { cache: overrides.cache || cache } : {}),
        signal: overrides.signal || controller.signal,
      }, proxyUrl, proxyTransport);
      const response = await guardedGet(url, {
        send,
        signal: controller.signal,
      });
      const result = validatePayload(response.payload, response, safeUrl);
      if (proxyUrl) {
        recordRequestProxyLoadSuccess(proxyUrl, { transport: proxyTransport });
      }
      return result;
    } catch (cause) {
      if (signal?.aborted) {
        lastError = abortError(signal, safeUrl);
      } else if (timedOut) {
        lastError = timeoutError(timeout, safeUrl);
      } else if (cause instanceof SiaTubeApiError) {
        lastError = cause;
      } else if (cause?.code === "INVALID_JSON") {
        lastError = new SiaTubeApiError("SiaTube API returned invalid JSONP", {
          code: "INVALID_JSON",
          url: safeUrl,
          retryable: true,
        });
      } else if (typeof cause?.code === "string") {
        lastError = new SiaTubeApiError(cause.message, {
          code: cause.code,
          status: cause.status,
          url: safeUrl,
          retryable: cause.retryable === true,
        });
        if (cause.name === "AbortError") lastError.name = "AbortError";
      } else {
        lastError = new SiaTubeApiError("Failed to reach the SiaTube API", {
          code: "NETWORK_ERROR",
          url: safeUrl,
          retryable: true,
        });
      }
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (signal) signal.removeEventListener("abort", onExternalAbort);
    }

    if (!lastError.retryable || attempt >= retries) {
      throw finalizeRequestError(lastError, proxyUrl, proxyTransport);
    }
    const retryAfter = Number(lastError.payload?.retryAfter);
    const retryDelay = lastError.status === 429 && Number.isFinite(retryAfter) && retryAfter >= 0
      ? retryAfter * 1_000 + Math.floor(Math.random() * 251)
      : RETRY_DELAY_MS * (attempt + 1);
    try {
      await delay(retryDelay, signal);
    } catch (cause) {
      throw finalizeRequestError(cause, proxyUrl, proxyTransport);
    }
  }

  throw finalizeRequestError(
    lastError || new SiaTubeApiError("SiaTube API request failed"),
    proxyUrl,
    proxyTransport,
  );
}

export function search(input, options = {}) {
  const params = typeof input === "string" ? { q: input } : (input || {});
  const mergedOptions = typeof input === "object" && input !== null
    ? { ...requestOptions(input), ...requestOptions(options) }
    : requestOptions(options);
  const queryValue = params.q ?? params.query;
  const q = typeof queryValue === "string" ? queryValue.trim() : "";
  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (!q && !token) throw validationError("q or token is required");

  return getJson("/api/search", {
    ...mergedOptions,
    query: {
      q: q || undefined,
      token: token || undefined,
      raw: booleanQuery(params.raw),
    },
  });
}

export function suggest(keyword, options = {}) {
  const value = requireString(keyword, "keyword");
  return getJson("/api/suggest/", {
    ...requestOptions(options),
    query: { keyword: value },
  });
}

export function video(id, options = {}) {
  const depth = options.depth;
  if (depth !== undefined && (!Number.isInteger(Number(depth)) || Number(depth) < 0)) {
    throw validationError("depth must be a non-negative integer");
  }
  const videoId = requireString(id, "id");
  let requestId = videoId;
  let token = options.token;
  let queryDepth = depth;
  // The API officially supports this embedded form. Its deployed depth query
  // currently ignores depth=2, while the embedded form performs the promised
  // initial related-video expansion.
  if (depth !== undefined) {
    requestId = options.token
      ? `${videoId}====token==i==${options.token}==p==depth==i==${depth}`
      : `${videoId}====depth==i==${depth}`;
    token = undefined;
    queryDepth = undefined;
  }
  return getJson(`/api/video/${pathSegment(requestId, "id")}`, {
    ...requestOptions(options),
    query: {
      token,
      depth: queryDepth,
      raw: booleanQuery(options.raw),
    },
  });
}

export function comments(videoId, options = {}) {
  const id = requireString(videoId, "videoId");
  if (options.sort !== undefined && options.sort !== "top" && options.sort !== "new") {
    throw validationError("sort must be 'top' or 'new'");
  }
  return getJson("/api/comments", {
    ...requestOptions(options),
    query: {
      videoId: id,
      sort: options.sort,
      continuation: options.continuation,
      raw: booleanQuery(options.raw),
    },
  });
}

export function commentReplies(videoId, continuation, options = {}) {
  return getJson("/api/comment/replies", {
    ...requestOptions(options),
    query: {
      videoId: requireString(videoId, "videoId"),
      continuation: requireString(continuation, "continuation"),
      raw: booleanQuery(options.raw),
    },
  });
}

export function channel(id, options = {}) {
  return getJson(`/api/channel/${pathSegment(id, "id")}`, {
    ...requestOptions(options),
    query: { raw: booleanQuery(options.raw) },
  });
}

export function playlist(id, options = {}) {
  return getJson(`/api/playlist/${pathSegment(id, "id")}`, {
    ...requestOptions(options),
    query: {
      token: options.token,
      v: options.v,
      raw: booleanQuery(options.raw),
    },
  });
}

function withSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function stream(videoId, options = {}) {
  const id = requireString(videoId, "videoId");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw validationError("videoId must be an 11-character YouTube video ID");
  }
  if (options.signal?.aborted) return Promise.reject(abortError(options.signal));

  const origin =
    options.origin === undefined ? "" : requireString(options.origin, "origin");
  const cacheKey = `${id}\u0000${origin}`;

  const now = Date.now();
  pruneStreamCache(now);
  const cached = streamCache.get(cacheKey);
  if (!options.forceRefresh && cached && now - cached.createdAt < STREAM_CACHE_TTL_MS) {
    return withSignal(Promise.resolve(cached.data), options.signal);
  }
  if (cached) streamCache.delete(cacheKey);

  let pending = streamRequests.get(cacheKey);
  if (!pending) {
    const controller = new AbortController();
    pending = getJson(`/api/stream/${pathSegment(id, "videoId")}`, {
      ...requestOptions({ ...options, signal: controller.signal }),
      query: { origin: origin || undefined },
    })
      .then((data) => {
        streamCache.set(cacheKey, { createdAt: Date.now(), data });
        return data;
      })
      .finally(() => {
        if (streamRequests.get(cacheKey) === pending) {
          streamRequests.delete(cacheKey);
        }
      });
    pending.cancel = () => controller.abort();
    streamRequests.set(cacheKey, pending);
  }

  return withSignal(pending, options.signal);
}

export function youtubeEducationStream(videoId, options = {}) {
  const id = requireString(videoId, "videoId");
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw validationError("videoId must be an 11-character YouTube video ID");
  }
  return getJson(`/api/stream/youtubeeducation/${pathSegment(id, "videoId")}`, {
    ...requestOptions(options),
    query: { origin: "siatube" },
    cache: "no-store",
  });
}

export function cancelStreamRequest(videoId, origin = "") {
  const id = requireString(videoId, "videoId");
  const normalizedOrigin = origin === "" ? "" : requireString(origin, "origin");
  const cacheKey = `${id}\u0000${normalizedOrigin}`;
  const pending = streamRequests.get(cacheKey);
  if (!pending) return false;
  streamRequests.delete(cacheKey);
  pending.cancel?.();
  return true;
}

export function streamStatus(options = {}) {
  return getJson("/api/stream/status", {
    ...requestOptions(options),
    cache: "no-store",
  });
}

export function clearStreamCache(videoId) {
  if (videoId === undefined) {
    streamCache.clear();
    return;
  }
  const id = requireString(videoId, "videoId");
  for (const key of streamCache.keys()) {
    if (key.startsWith(`${id}\u0000`)) streamCache.delete(key);
  }
}

export {
  DEFAULT_RETRIES,
  DEFAULT_TIMEOUT_MS,
  STREAM_CACHE_TTL_MS,
};
