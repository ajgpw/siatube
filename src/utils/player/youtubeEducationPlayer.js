const EDUCATION_HOST = "https://www.youtubeeducation.com";
const SHEET_ID = "1dily2wiik92TAyK3zyIsu8TDuyYNoF20IM1iMk_X-pg";
const SHEET_NAME = "Youtube-education-parameter";
const SHEET_CACHE_MS = 60 * 60 * 1000;
const WIDGET_API_SCRIPT_ID = "youtube-education-widget-api";

let cachedPlayerData = null;
let cachedAt = 0;
let widgetApiPromise = null;

function parseGoogleVisualizationResponse(text) {
  const marker = "google.visualization.Query.setResponse(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(");");
  if (start < 0 || end < start) {
    throw new Error("スプレッドシートのレスポンス形式が不正です");
  }
  return JSON.parse(text.slice(start + marker.length, end));
}

export async function loadYoutubeEducationPlayerData({
  forceRefresh = false,
} = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedPlayerData &&
    now - cachedAt < SHEET_CACHE_MS
  ) {
    return cachedPlayerData;
  }

  const query = new URLSearchParams({
    tqx: "out:json",
    sheet: SHEET_NAME,
    range: "A1:A2",
    headers: "0",
  });
  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?${query}`,
  );
  if (!response.ok) {
    throw new Error(`スプレッドシートの取得に失敗しました (${response.status})`);
  }

  const data = parseGoogleVisualizationResponse(await response.text());
  if (data?.status === "error") {
    throw new Error("スプレッドシートからプレイヤー設定を取得できませんでした");
  }

  const parameterText = data?.table?.rows?.[0]?.c?.[0]?.v;
  const widgetApiSource = data?.table?.rows?.[1]?.c?.[0]?.v;
  if (typeof parameterText !== "string" || !parameterText.trim()) {
    throw new Error("スプレッドシートのA1にパラメータがありません");
  }
  if (typeof widgetApiSource !== "string" || !widgetApiSource.trim()) {
    throw new Error("スプレッドシートのA2にPlayer APIコードがありません");
  }

  cachedPlayerData = { parameterText, widgetApiSource };
  cachedAt = now;
  return cachedPlayerData;
}

export function createYoutubeEducationEmbedUrl(
  videoId,
  parameterText,
  { autoplay = false } = {},
) {
  const normalizedParameterText = String(parameterText || "")
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/gi, "&")
    .replace(/&#x0*26;/gi, "&")
    .replace(/^\?/, "");
  const params = new URLSearchParams(normalizedParameterText);

  params.set("enablejsapi", "1");
  params.set("controls", "1");
  params.set("playsinline", "1");
  params.set("autoplay", autoplay ? "1" : "0");
  if (!params.has("widgetid")) params.set("widgetid", "1");

  if (
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:")
  ) {
    params.set("origin", window.location.origin);
    params.set("forigin", window.location.href);
  }

  return `${EDUCATION_HOST}/embed/${encodeURIComponent(videoId)}?${params}`;
}

export function ensureYoutubeEducationPlayerApi(widgetApiSource) {
  if (window.YT && typeof window.YT.Player === "function") {
    return Promise.resolve(window.YT);
  }
  if (widgetApiPromise) return widgetApiPromise;
  if (typeof widgetApiSource !== "string" || !widgetApiSource.trim()) {
    return Promise.reject(new Error("Player APIコードが空です"));
  }

  widgetApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    let timeoutTimer = null;

    const cleanupTimers = () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (timeoutTimer !== null) window.clearTimeout(timeoutTimer);
    };
    const finish = () => {
      if (settled || !window.YT || typeof window.YT.Player !== "function") {
        return false;
      }
      settled = true;
      cleanupTimers();
      resolve(window.YT);
      return true;
    };

    const previousReadyCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = (...args) => {
      if (typeof previousReadyCallback === "function") {
        try {
          previousReadyCallback(...args);
        } catch {}
      }
      finish();
    };

    pollTimer = window.setInterval(finish, 50);
    timeoutTimer = window.setTimeout(() => {
      if (finish()) return;
      settled = true;
      cleanupTimers();
      document.getElementById(WIDGET_API_SCRIPT_ID)?.remove();
      reject(new Error("IFrame Player APIの初期化がタイムアウトしました"));
    }, 5000);

    let script = document.getElementById(WIDGET_API_SCRIPT_ID);
    if (!script) {
      script = document.createElement("script");
      script.id = WIDGET_API_SCRIPT_ID;
      script.textContent = widgetApiSource;
      document.head.appendChild(script);
    }
    finish();
  }).catch((error) => {
    widgetApiPromise = null;
    throw error;
  });

  return widgetApiPromise;
}
