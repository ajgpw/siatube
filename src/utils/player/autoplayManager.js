const PLAY_HISTORY_KEY = "yt_play_history_v1";

function loadPlayHistory() {
  try {
    const stored = localStorage.getItem(PLAY_HISTORY_KEY);
    const history = stored ? JSON.parse(stored) : [];
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function savePlayHistory(history) {
  try {
    localStorage.setItem(
      PLAY_HISTORY_KEY,
      JSON.stringify(history.slice(-3)),
    );
  } catch {}
}

export function pushToAutoplayHistory(videoId) {
  if (!videoId) return;
  const history = loadPlayHistory();
  if (history[history.length - 1] === videoId) return;
  history.push(videoId);
  savePlayHistory(history);
}

/**
 * タイプ1・タイプ2で共通の自動再生候補を選ぶ。
 * @param {string} currentVideoId
 * @param {{onNoSuitableVideo?: Function}} options
 * @returns {string|null}
 */
export function getAutoplayCandidateId(
  currentVideoId,
  { onNoSuitableVideo } = {},
) {
  try {
    const recent = new Set(loadPlayHistory());
    recent.add(currentVideoId);

    const filterConfig = window.__autoplayDurationFilter || {
      enabled: false,
      maxSeconds: 240,
    };
    const maxSeconds = filterConfig.enabled
      ? Number(filterConfig.maxSeconds) || 240
      : Infinity;

    const passesFilter = (durationValue) => {
      if (!filterConfig.enabled || !durationValue) return true;
      const duration = Number.parseInt(durationValue, 10);
      return Number.isNaN(duration) || duration <= maxSeconds;
    };

    if (Array.isArray(window.__autoplayCandidates)) {
      for (const id of window.__autoplayCandidates) {
        if (id && !recent.has(id)) return id;
      }
    }

    let foundAnyVideo = false;
    const elements = document.querySelectorAll("[data-video-id]");
    for (const element of elements) {
      const id = element.getAttribute("data-video-id");
      if (!id || recent.has(id)) continue;

      foundAnyVideo = true;
      if (!passesFilter(element.getAttribute("data-duration"))) continue;
      return id;
    }

    if (foundAnyVideo && filterConfig.enabled) onNoSuitableVideo?.();
  } catch {}
  return null;
}
