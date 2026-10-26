import { loadGuardSession } from "../guard/guard-session.js";

const YOUTUBE_ORIGIN = "https://img.youtube.com";
const PROXY_ORIGIN = "https://siatube-web.online";
const PROBE_VIDEO_ID = "dQw4w9WgXcQ";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PROBE_TIMEOUT_MS = 3_000;
const SUCCESS_TTL_MS = 5 * 60_000;
const FAILURE_TTL_MS = 30_000;
const probes = new Map();
let currentMode = "youtube";

function abortError(signal) {
  const error = new Error("Thumbnail selection was aborted", { cause: signal?.reason });
  error.name = "AbortError";
  error.code = "ABORTED";
  return error;
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function verifiedSession() {
  const session = loadGuardSession();
  return session?.verifiedUntil > Date.now() ? session : null;
}

function proxyThumbnail(id, session = verifiedSession()) {
  if (!session) return "";
  const url = new URL(PROXY_ORIGIN);
  url.searchParams.set("token", id);
  url.searchParams.set("guard_sid", session.sessionId);
  return url.toString();
}

function waitForProbe(promise, signal) {
  if (!signal) return promise;
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then((available) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) reject(abortError(signal));
      else resolve(available);
    }, (error) => {
      signal.removeEventListener("abort", onAbort);
      reject(error);
    });
  });
}

// Use an image load, without CORS, to test the same access needed by <img>.
// Concurrent API requests share probes; aborting one caller leaves others intact.
function probeImage(url, signal) {
  checkAbort(signal);
  const now = Date.now();
  for (const [key, entry] of probes) {
    if (entry.expiresAt <= now) probes.delete(key);
  }
  let entry = probes.get(url);
  if (!entry) {
    entry = { expiresAt: Infinity, promise: null };
    entry.promise = new Promise((resolve) => {
      let img;
      let timer;
      let settled = false;
      const finish = (available) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (img) {
          img.onload = null;
          img.onerror = null;
          img.removeAttribute?.("src");
        }
        resolve(available);
      };
      entry.cancel = () => finish(false);
      try {
        img = new globalThis.Image();
        img.referrerPolicy = "no-referrer";
        img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0);
        img.onerror = () => finish(false);
        timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
        img.src = url;
      } catch {
        finish(false);
      }
    }).then((available) => {
      entry.expiresAt = Date.now() + (available ? SUCCESS_TTL_MS : FAILURE_TTL_MS);
      return available;
    });
    probes.set(url, entry);
  }
  return waitForProbe(entry.promise, signal);
}

export async function isThumbnailProxyAvailable({ signal } = {}) {
  checkAbort(signal);
  const session = verifiedSession();
  if (!session || typeof globalThis.Image !== "function") return false;
  return probeImage(proxyThumbnail(PROBE_VIDEO_ID, session), signal);
}

export async function selectThumbnailMode({ signal } = {}) {
  checkAbort(signal);
  if (typeof globalThis.Image !== "function") return (currentMode = "txt");
  if (await probeImage(`${YOUTUBE_ORIGIN}/vi/${PROBE_VIDEO_ID}/default.jpg`, signal)) {
    return (currentMode = "youtube");
  }
  // The first API call establishes/renews authentication. Its caller checks the
  // proxy after that call and refetches with img=txt if the proxy cannot load.
  if (!verifiedSession()) return (currentMode = "url");
  return (currentMode = await isThumbnailProxyAvailable({ signal }) ? "url" : "txt");
}

function videoIdFromUrl(url) {
  if (url.origin === PROXY_ORIGIN) {
    const id = url.searchParams.get("token");
    return VIDEO_ID.test(id || "") ? id : "";
  }
  if (url.hostname === "img.youtube.com" || /^(?:i|i[1-4])\.ytimg\.com$/.test(url.hostname)) {
    const id = url.pathname.match(/^\/vi(?:_webp)?\/([^/]+)\//)?.[1];
    return VIDEO_ID.test(id || "") ? id : "";
  }
  return "";
}

function videoThumbnail(id, mode) {
  if (mode === "url") return proxyThumbnail(id);
  if (mode === "youtube") return `${YOUTUBE_ORIGIN}/vi/${id}/sddefault.jpg`;
  return "";
}

/** Turn API thumbnail IDs/base64/URLs into browser image sources. */
export function resolveThumbnailSource(value, mode = currentMode) {
  if (typeof value !== "string" || !value.trim()) return "";
  const source = value.trim();
  if (VIDEO_ID.test(source)) return videoThumbnail(source, mode);
  if (/^data:image\//i.test(source)) return source;
  try {
    const url = new URL(source);
    const id = videoIdFromUrl(url);
    if (id && (mode === "youtube" || mode === "url")) {
      if (mode === "youtube" && url.origin !== PROXY_ORIGIN) {
        url.protocol = "https:";
        url.host = new URL(YOUTUBE_ORIGIN).host;
        url.searchParams.delete("guard_sid");
        return url.toString();
      }
      return videoThumbnail(id, mode);
    }
    // A saved proxy reference must always use the current verified session.
    if (url.origin === PROXY_ORIGIN && id) return videoThumbnail(id, mode);
    return source;
  } catch {}
  if (source.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(source)) {
    return `data:image/jpeg;base64,${source}`;
  }
  return source;
}

/** Keep video identity, never the authenticated proxy URL, in persistent data. */
export function thumbnailForStorage(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    if (url.origin === PROXY_ORIGIN) return videoIdFromUrl(url);
    if (!url.searchParams.has("guard_sid")) return value;
    url.searchParams.delete("guard_sid");
    return url.toString();
  } catch {
    return value;
  }
}

function normalizeThumbnailCollection(value, mode) {
  if (typeof value === "string") return [{ url: resolveThumbnailSource(value, mode) }];
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string"
      ? { url: resolveThumbnailSource(item, mode) }
      : normalizeThumbnailCollection(item, mode));
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "url" ? resolveThumbnailSource(item, mode)
      : item && typeof item === "object" ? normalizeThumbnailCollection(item, mode) : item,
  ]));
}

/** Normalize only thumbnail fields, leaving icons, links and continuation data intact. */
export function normalizeThumbnailPayload(payload, { mode } = {}) {
  if (mode) currentMode = mode;
  const selectedMode = mode || currentMode;
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      (key === "thumbnail" || key === "thumbnailUrl") && typeof item === "string"
        ? resolveThumbnailSource(item, selectedMode)
        : key === "thumbnails" ? normalizeThumbnailCollection(item, selectedMode) : visit(item),
    ]));
  };
  return visit(payload);
}

export function __resetThumbnailSourceForTests() {
  for (const entry of probes.values()) entry.cancel?.();
  probes.clear();
  currentMode = "youtube";
}
