/**
 * Apple デバイス（iOS Safari, iOS Chrome, macOS Safari, macOS Chrome 等）を判定する。
 */
export function isAppleDevice(nav = (typeof navigator !== "undefined" ? navigator : null)) {
  if (!nav) return false;
  const ua = nav.userAgent || "";
  const platform = nav.platform || "";
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (platform === "MacIntel" && typeof nav.maxTouchPoints === "number" && nav.maxTouchPoints > 1);
  const isMac = /Macintosh|Mac OS X/i.test(ua) || platform === "MacIntel";
  return isIOS || isMac;
}

/**
 * 与えられたソースオブジェクトが m3u8 / HLS かどうかを判定する。
 */
export function isM3u8Source(source) {
  if (!source) return false;
  if (source.isM3u8) return true;
  const mt = (source.mimeType || "").toLowerCase();
  const url = (source.url || "").toLowerCase();
  return mt.includes("application/x-mpegurl") ||
    mt.includes("application/vnd.apple.mpegurl") ||
    url.includes(".m3u8");
}

/**
 * media要素が現在選択しているソースを優先して、HLS再生中か判定する。
 * currentSrcがまだ決まっていないロード開始直後だけ、先頭候補を使用する。
 */
export function isM3u8PlaybackActive(mediaElement, candidateSources = []) {
  const currentSrc = mediaElement?.currentSrc || mediaElement?.src || "";
  if (currentSrc) {
    const matchingSource = candidateSources.find(
      (source) => source?.url === currentSrc,
    );
    return isM3u8Source(matchingSource || { url: currentSrc });
  }

  const firstCandidate = candidateSources.find((source) => source?.url);
  return isM3u8Source(firstCandidate);
}

/**
 * HLSの失敗監視は、実際に再生が要求された後だけ開始する。
 * durationが00:00の遅延ロード型HLSを、待機中に失敗扱いしないための判定。
 */
export function shouldMonitorM3u8Playback({ attempted, disabled, active }) {
  return Boolean(attempted && !disabled && active);
}

/**
 * ネイティブHLSが利用可能ならHLSだけをvideo要素へ渡し、ブラウザ側で
 * progressiveへ先回りして切り替わらないようにする。
 */
export function selectNativeHlsSources(sources, { useM3u8 = true } = {}) {
  if (!Array.isArray(sources)) return [];
  const hlsSources = sources.filter(isM3u8Source);
  if (useM3u8 && hlsSources.length > 0) return hlsSources;
  if (!useM3u8) return sources.filter((source) => !isM3u8Source(source));
  return sources;
}

export function getMediaSourceMimeType(source) {
  if (isM3u8Source(source)) return "application/vnd.apple.mpegurl";
  return source?.mimeType || undefined;
}

function getEntryStreamSources(entry) {
  if (!entry) return [];
  return [
    entry,
    ...(Array.isArray(entry.sources) ? entry.sources : []),
    entry.video,
    ...(Array.isArray(entry.video?.sources) ? entry.video.sources : []),
    entry.audio,
  ].filter((source) => source?.url);
}

export function getFirstM3u8Url(entry) {
  return getEntryStreamSources(entry).find(isM3u8Source)?.url || "";
}

export function hasNonM3u8Fallback(sources, muxedFallbackSources = []) {
  const entries = sources && typeof sources === "object"
    ? Object.values(sources)
    : [];
  if (entries.some((entry) => hasPlayableSource(entry, { useM3u8: false }))) {
    return true;
  }
  return muxedFallbackSources.some(
    (source) => source?.url && !isM3u8Source(source),
  );
}

export function getExternalM3u8Url(
  sources,
  availableQualities,
  preferredQuality,
  muxedFallbackSources = [],
) {
  if (hasNonM3u8Fallback(sources, muxedFallbackSources)) return "";
  const preferredUrl = getFirstM3u8Url(sources?.[preferredQuality]);
  if (preferredUrl) return preferredUrl;
  for (const quality of Array.isArray(availableQualities) ? availableQualities : []) {
    const url = getFirstM3u8Url(sources?.[quality]);
    if (url) return url;
  }
  return "";
}

/**
 * H.264 コーデックを優先するよう並び替える。
 */
export function preferH264First(list) {
  try {
    if (!Array.isArray(list) || list.length <= 1) return list || [];
    const isH264 = (s) => {
      const mt = (s && s.mimeType) ? String(s.mimeType).toLowerCase() : "";
      const url = (s && s.url) ? String(s.url).toLowerCase() : "";
      if (mt.includes("video/mp4")) return true;
      if (mt.includes("avc1") || mt.includes("h264")) return true;
      if (url.endsWith(".mp4")) return true;
      if (url.includes("codecs=avc1") || url.includes("codecs%3davc1")) return true;
      return false;
    };
    return list.slice().sort((a, b) => {
      const aw = isH264(a) ? 1 : 0;
      const bw = isH264(b) ? 1 : 0;
      return bw - aw;
    });
  } catch (e) {
    return list || [];
  }
}

/**
 * single-stream エントリから全候補ソースを取得する。
 */
export function getAllSingleStreamSources(entry, { useM3u8 = true } = {}) {
  try {
    if (!entry) return [];
    const rawList = Array.isArray(entry.sources)
      ? entry.sources
      : (entry.url ? [{ url: entry.url, mimeType: entry.mimeType, isM3u8: !!entry.isM3u8 }] : []);
    if (rawList.length === 0) return [];
    if (useM3u8) return rawList;
    return preferH264First(rawList.filter((s) => !isM3u8Source(s)));
  } catch (e) {
    return [];
  }
}

/**
 * single-stream エントリから、端末およびフォールバック状態に応じたソース配列を取得する。
 * Apple端末かつフォールバック有効時は1個のみ返す。
 */
export function getSingleStreamSourcesList(entry, {
  isApple = false,
  fallbackActive = false,
  sourceIndex = 0,
  useM3u8 = true,
} = {}) {
  try {
    const list = getAllSingleStreamSources(entry, { useM3u8 });
    if (list.length === 0) return [];
    if (isApple && fallbackActive) {
      const idx = Math.min(Math.max(0, sourceIndex), list.length - 1);
      return [list[idx]];
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * 映像+音声（separated）エントリから全候補映像ソースを取得する。
 */
export function getAllVideoSourcesForEntry(entry) {
  try {
    const sourcesList = entry?.video?.sources;
    if (Array.isArray(sourcesList) && sourcesList.length > 0) return preferH264First(sourcesList);
    if (entry?.video?.url) return preferH264First([{ url: entry.video.url, mimeType: entry.video.mimeType }]);
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * 映像+音声（separated）エントリから、端末およびフォールバック状態に応じた映像ソース配列を取得する。
 * Apple端末かつフォールバック有効時は1個のみ返す。
 */
export function getVideoSourcesForEntryList(entry, {
  isApple = false,
  fallbackActive = false,
  sourceIndex = 0,
} = {}) {
  try {
    const list = getAllVideoSourcesForEntry(entry);
    if (list.length === 0) return [];
    if (isApple && fallbackActive) {
      const idx = Math.min(Math.max(0, sourceIndex), list.length - 1);
      return [list[idx]];
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * 与えられた品質エントリが指定条件（useM3u8等）で実際に再生可能なソースを持っているか判定する。
 */
export function hasPlayableSource(entry, { useM3u8 = true } = {}) {
  if (!entry) return false;

  // 1. single-stream (muxed または HLS)
  const singleSources = getSingleStreamSourcesList(entry, {
    isApple: false,
    fallbackActive: false,
    useM3u8,
  });
  if (singleSources.length > 0 && singleSources.some((s) => s?.url && (useM3u8 || !isM3u8Source(s)))) {
    return true;
  }

  // 2. video + audio (separated)
  const videoSources = getVideoSourcesForEntryList(entry, {
    isApple: false,
    fallbackActive: false,
  });
  const validVideo = videoSources.filter((s) => s?.url && (useM3u8 || !isM3u8Source(s)));
  const validAudio = Boolean(entry.audio?.url && (useM3u8 || !isM3u8Source(entry.audio)));
  if (validVideo.length > 0 && validAudio) {
    return true;
  }

  // 3. audio-only
  if (entry.audio?.url && !entry.video && !entry.url && (useM3u8 || !isM3u8Source(entry.audio))) {
    return true;
  }

  return false;
}

/**
 * sources マップと availableQualities から、指定条件（useM3u8等）で実際に再生可能な最適な画質キーを取得する。
 */
export function selectBestPlayableQuality(sources, availableQualities, preferredQuality = "", { useM3u8 = true } = {}) {
  if (!sources || !Array.isArray(availableQualities) || availableQualities.length === 0) {
    return "";
  }

  // 実際に再生可能な画質のみに絞り込む
  const playableQualities = availableQualities.filter((q) => {
    const entry = sources[q];
    return hasPlayableSource(entry, { useM3u8 });
  });

  if (playableQualities.length === 0) {
    // Respect the candidate list: excluded/failed qualities must not be reselected.
    return "";
  }

  // 優先画質が指定されており、それが再生可能ならそれを返す
  if (preferredQuality && preferredQuality !== "auto") {
    if (playableQualities.includes(preferredQuality)) {
      return preferredQuality;
    }
    const alt = `${preferredQuality}_2`;
    if (playableQualities.includes(alt)) {
      return alt;
    }
  }

  // 単独ストリーム（muxed/single）を持つ画質を優先（1080p -> 720p -> 480p -> 360p ...）
  const parseHeight = (k) => {
    const m = String(k || "").match(/^(\d+)p/);
    return m ? parseInt(m[1], 10) : 0;
  };

  const sorted = playableQualities.slice().sort((a, b) => {
    const aMux = sources[a]?.url ? 1 : 0;
    const bMux = sources[b]?.url ? 1 : 0;
    if (aMux !== bMux) return bMux - aMux;
    const aH = parseHeight(a);
    const bH = parseHeight(b);
    if (aH !== bH) return bH - aH;
    return a.localeCompare(b);
  });

  return sorted[0] || playableQualities[0] || "";
}
