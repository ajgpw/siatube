// Utilities for parsing /api/<id>/type2 responses into the shape expected by StreamType2.vue
import { isMseHlsSupported } from "./hlsLoader.js";

function extractMimeTypeAndCodecs(f) {
  try {
    if (f.isM3u8) return "application/x-mpegURL";
    if (f._probeByUrl) return null;

    if (f.mimeType) return f.mimeType;

    const container = (f.container || f.ext || "").toLowerCase();
    if (!container) return null;

    const baseType = f.hasVideo !== false ? "video" : "audio";
    let mimeBase = `${baseType}/${container}`;

    if (container === "mp3") mimeBase = "audio/mpeg";
    if (container === "m4a") mimeBase = "audio/mp4";
    if (container === "aac") mimeBase = "audio/aac";

    let codecs = f.codecs;
    if (!codecs) {
      const extractedCodecs = [];
      if (f.vcodec && f.vcodec !== "none") extractedCodecs.push(f.vcodec);
      if (f.acodec && f.acodec !== "none") extractedCodecs.push(f.acodec);
      if (extractedCodecs.length > 0) {
        codecs = extractedCodecs.join(", ");
      }
    }

    return codecs ? `${mimeBase}; codecs="${codecs}"` : mimeBase;
  } catch (e) {
    return null;
  }
}

/**
 * フォーマットのサポートレベル ('probably', 'maybe', または '') を返します。
 * 偽陽性を防ぐため、MediaSource.isTypeSupported を優先的に使用します。
 */
function getSupportLevel(f, { allowM3u8 = false } = {}) {
  try {
    if (f.isM3u8) {
      const media = document.createElement("video");
      return media.canPlayType("application/vnd.apple.mpegurl") ||
        media.canPlayType("application/x-mpegURL") ||
        (allowM3u8 ? "probably" : "") ||
        (isMseHlsSupported() ? "probably" : "");
    }

    const typeStr = extractMimeTypeAndCodecs(f);
    if (!typeStr) {
      return 'unknown';
    }

    // 1. MSE (MediaSource) が利用可能な場合は、厳密な判定を行う
    if (window.MediaSource && typeof window.MediaSource.isTypeSupported === 'function') {
      const mseSupported = window.MediaSource.isTypeSupported(typeStr);
      if (mseSupported) return 'probably';
    }

    // 2. フォールバックとして通常の canPlayType で判定
    const media = document.createElement(f.hasVideo === false ? 'audio' : 'video');
    const playType = media.canPlayType(typeStr);

    // Safariなどで再生できないのに 'maybe' を返す偽陽性をガードする
    if (playType === 'maybe') {
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      if (isSafari && typeStr.includes('av01')) {
        return '';
      }
    }

    return playType;
  } catch (e) {
    return '';
  }
}

function resolutionToQualityLabel(resolution) {
  try {
    if (!resolution || typeof resolution !== "string") return "";
    const trimmed = resolution.trim();
    if (trimmed === "audio only") return "audio";

    const match = trimmed.match(/(\d+)\s*[xX]\s*(\d+)/);
    if (match) {
      const height = match[2];
      return `${height}p`;
    }

    if (/^\d+p$/.test(trimmed)) return trimmed;
    return trimmed;
  } catch (e) {
    return "";
  }
}

function sortQualities(keys) {
  try {
    const parseKey = (k) => {
      const base = k.replace(/_\d+$/, "");
      const m = base.match(/^(\d+)p$/);
      if (m) return parseInt(m[1], 10);
      return -1;
    };

    return keys.slice().sort((a, b) => {
      const aVal = parseKey(a);
      const bVal = parseKey(b);
      if (aVal !== bVal) return bVal - aVal;
      if (a.includes("_2") && !b.includes("_2")) return 1;
      if (b.includes("_2") && !a.includes("_2")) return -1;
      return a.localeCompare(b);
    });
  } catch (e) {
    return keys || [];
  }
}

function chooseBestAudio(audioOnly, videoHeight) {
  try {
    if (!Array.isArray(audioOnly) || audioOnly.length === 0) return null;

    let minItag = 139;
    if (videoHeight >= 720) minItag = 140;
    if (videoHeight >= 1080) minItag = 141;

    const filtered = audioOnly.filter(a => Number(a.itag) >= minItag);
    const candidates = filtered.length > 0 ? filtered : audioOnly;

    const extPrefs = { 'm4a': 0, 'webm': 1, 'mp3': 2 };
    const ranked = candidates.map(a => ({
      fmt: a,
      itag: Number(a.itag) || 0,
      extRank: extPrefs[a.ext?.toLowerCase()] ?? 3,
      supportScore: a._supportLevel === 'probably' ? 2 : (a._supportLevel === 'maybe' ? 1 : 0)
    }));

    ranked.sort((a, b) => {
      if (a.supportScore !== b.supportScore) return b.supportScore - a.supportScore;
      return b.itag - a.itag || a.extRank - b.extRank;
    });
    return ranked[0]?.fmt || null;
  } catch (e) {
    return null;
  }
}

function chooseBestFormat(formats, preferExtOrder = ["mp4", "webm"]) {
  try {
    if (!Array.isArray(formats) || formats.length === 0) return null;
    const ranked = formats.map((f) => {
      const ext = (f.ext || "").toLowerCase();
      const rank = preferExtOrder.indexOf(ext);
      return {
        fmt: f,
        rank: rank === -1 ? preferExtOrder.length : rank,
        itag: Number(f.itag) || 0,
        supportScore: f._supportLevel === 'probably' ? 2 : (f._supportLevel === 'maybe' ? 1 : 0)
      };
    });

    ranked.sort((a, b) => {
      if (a.supportScore !== b.supportScore) return b.supportScore - a.supportScore;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.itag - a.itag;
    });
    return ranked[0].fmt;
  } catch (e) {
    return null;
  }
}

function sortFormatsByPreference(formats, preferExtOrder = ["mp4", "webm"]) {
  try {
    if (!Array.isArray(formats) || formats.length === 0) return [];
    const ranked = formats.map((f) => {
      const ext = (f.ext || "").toLowerCase();
      const rank = preferExtOrder.indexOf(ext);
      return {
        fmt: f,
        rank: rank === -1 ? preferExtOrder.length : rank,
        itag: Number(f.itag) || 0,
        supportScore: f._supportLevel === 'probably' ? 2 : (f._supportLevel === 'maybe' ? 1 : 0)
      };
    });
    ranked.sort((a, b) => {
      if (a.supportScore !== b.supportScore) return b.supportScore - a.supportScore;
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.itag - a.itag;
    });
    return ranked.map((r) => r.fmt);
  } catch (e) {
    return [];
  }
}

function parseFormatsArray(formats, options = {}) {
  try {
    if (!Array.isArray(formats)) return null;

    const candidates = formats.filter((f) => f?.url).map((f) => ({
      ...f, _supportLevel: getSupportLevel(f, options),
    }));

    // Capability checks are hints. Keep URL-only probes for a last playback attempt.
    const muxedFallbackSources = candidates
      .filter((f) => f?.url && f.hasVideo && f.hasAudio)
      .map((f) => ({
        url: f.url,
        mimeType: f._supportLevel ? extractMimeTypeAndCodecs(f) : null,
        isM3u8: !!f.isM3u8,
      }));

    formats = candidates.filter((f) => f._supportLevel);
    // Do not report an empty response solely because a codec hint was rejected.
    // Omitting type lets the media element inspect the actual resource.
    if (formats.length === 0) {
      formats = candidates.map((f) => ({ ...f, _probeByUrl: true }));
    } else if (!formats.some((f) => f.hasVideo)) {
      // Supported audio must not hide a video URL whose codec hint was inconclusive.
      formats.push(...candidates.filter((f) => f.hasVideo && !f._supportLevel)
        .map((f) => ({ ...f, _probeByUrl: true })));
    }

    const byQuality = {};
    for (const f of formats) {
      try {
        if (!f || !f.url) continue;
        const quality = resolutionToQualityLabel(f.resolution);
        if (!quality) continue;
        if (!byQuality[quality]) byQuality[quality] = [];
        byQuality[quality].push(f);
      } catch (e) {
        continue;
      }
    }

    const audioOnlyAll = formats.filter((f) => !f.hasVideo && f.hasAudio);

    const sources = {};
    const qualityLabels = {};
    let hasM3u8 = false;

    for (const [quality, list] of Object.entries(byQuality)) {
      try {
        const muxedList = list.filter((f) => f.hasVideo && f.hasAudio);
        const muxedSorted = sortFormatsByPreference(muxedList, ["mp4", "webm"]);
        if (muxedSorted.length > 0) {
          const sourcesList = muxedSorted.map((m) => {
            if (m.isM3u8) hasM3u8 = true;
            return {
              url: m.url,
              mimeType: extractMimeTypeAndCodecs(m),
              isM3u8: !!m.isM3u8,
            };
          });
          sources[quality] = {
            url: sourcesList[0].url,
            mimeType: sourcesList[0].mimeType,
            isM3u8: sourcesList[0].isM3u8,
            sources: sourcesList,
          };
          qualityLabels[quality] = quality === "audio" ? "Audio" : quality;
        }

        const videoOnly = list.filter((f) => f.hasVideo && !f.hasAudio);
        if (muxedSorted.length > 0 && videoOnly.length === 0) continue;
        // Keep separated AV even when a muxed URL exists at the same resolution.
        const qualityKey = muxedSorted.length > 0 ? `${quality}_2` : quality;
        let audioOnly = list.filter((f) => !f.hasVideo && f.hasAudio);
        if (audioOnly.length === 0) audioOnly = audioOnlyAll;

        const height = parseInt(quality.replace('p', '')) || 0;
        const videoOnlySorted = sortFormatsByPreference(videoOnly, ["mp4", "webm"]);
        const bestVideo = videoOnlySorted[0] || null;
        const bestAudio = chooseBestAudio(audioOnly, height);

        if (bestVideo || bestAudio) {
          if (bestVideo && !bestAudio) {
            const isM3u8 = !!bestVideo.isM3u8;
            if (isM3u8) hasM3u8 = true;
            sources[qualityKey] = {
              url: bestVideo.url,
              mimeType: extractMimeTypeAndCodecs(bestVideo),
              isM3u8,
              sources: videoOnlySorted.map((v) => ({
                url: v.url,
                mimeType: extractMimeTypeAndCodecs(v),
                isM3u8: !!v.isM3u8,
              })),
            };
            qualityLabels[qualityKey] = qualityKey === quality ? quality : `${quality} (映像・音声別)`;
            continue;
          }

          const entry = {};
          if (bestVideo) {
            if (bestVideo.isM3u8) hasM3u8 = true;
            entry.video = {
              url: bestVideo.url,
              mimeType: extractMimeTypeAndCodecs(bestVideo),
              sources: videoOnlySorted.map((v) => ({
                url: v.url,
                mimeType: extractMimeTypeAndCodecs(v),
                isM3u8: !!v.isM3u8,
              })),
            };
          }
          if (bestAudio) {
            if (bestAudio.isM3u8) hasM3u8 = true;
            entry.audio = {
              url: bestAudio.url,
              mimeType: extractMimeTypeAndCodecs(bestAudio),
            };
          }
          sources[qualityKey] = entry;
          qualityLabels[qualityKey] = quality === "audio" ? "Audio"
            : (qualityKey === quality ? quality : `${quality} (映像・音声別)`);
        }
      } catch (e) {
        continue;
      }
    }

    const allQualities = sortQualities(Object.keys(sources));
    const muxedQualities = allQualities.filter((q) => sources[q]?.url);
    const defaultQuality = muxedQualities[0]
      ? muxedQualities[0]
      : (allQualities.includes("1080p") ? "1080p" : (allQualities[0] || ""));

    return {
      sources,
      availableQualities: allQualities,
      qualityLabels,
      defaultQuality,
      hasM3u8,
      muxedFallbackSources,
    };
  } catch (e) {}
  return {
    sources: {},
    availableQualities: [],
    qualityLabels: {},
    defaultQuality: "",
    hasM3u8: false,
    muxedFallbackSources: [],
  };
}

export function parseStream2Response(data, options = {}) {
  try {
    const hasFormats = Array.isArray(data?.formats);
    if (!data || typeof data !== "object") {
      return {
        sources: {},
        availableQualities: [],
        qualityLabels: {},
        defaultQuality: "",
        hasM3u8: false,
      };
    }

    if (Array.isArray(data.formats)) return parseFormatsArray(data.formats, options);

    // 旧形式のレスポンス
    const srcs = {};
    const qualities = [];
    const m3u8srcs = {};
    const m3u8Qualities = [];

    try {
      if (Array.isArray(data.videourl)) {
        data.videourl.forEach((item) => {
          try {
            const key = Object.keys(item)[0];
            if (/^\d{3,4}p$/.test(key)) {
              qualities.push(key);
              const vv = item[key];
              srcs[key] = {
                video: vv.video ? { url: vv.video.url, mimeType: vv.video.mimeType } : null,
                audio: vv.audio ? { url: vv.audio.url, mimeType: vv.audio.mimeType } : null,
              };
            }
          } catch (e) {
          }
        });
      } else if (typeof data.videourl === "object" && data.videourl !== null) {
        Object.keys(data.videourl).forEach((key) => {
          try {
            if (/^\d{3,4}p$/.test(key)) {
              qualities.push(key);
              const vv = data.videourl[key];
              srcs[key] = {
                video: vv.video ? { url: vv.video.url, mimeType: vv.video.mimeType } : null,
                audio: vv.audio ? { url: vv.audio.url, mimeType: vv.audio.mimeType } : null,
              };
            }
          } catch (e) {
          }
        });
      }
    } catch (e) {
    }

    try {
      if (Array.isArray(data.m3u8)) {
        data.m3u8.forEach((item) => {
          try {
            const key = Object.keys(item)[0];
            if (/^\d{3,4}p$/.test(key)) {
              let murl = item[key]?.url;
              if (typeof murl === "object" && murl?.url) murl = murl.url;
              if (murl) {
                m3u8Qualities.push(key);
                m3u8srcs[key] = { url: murl, mimeType: "application/x-mpegURL" };
              }
            }
          } catch (e) {
          }
        });
      } else if (typeof data.m3u8 === "object" && data.m3u8 !== null) {
        Object.keys(data.m3u8).forEach((key) => {
          try {
            if (/^\d{3,4}p$/.test(key)) {
              let murl = data.m3u8[key]?.url;
              if (typeof murl === "object" && murl?.url) murl = murl.url;
              if (murl) {
                m3u8Qualities.push(key);
                m3u8srcs[key] = { url: murl, mimeType: "application/x-mpegURL" };
              }
            }
          } catch (e) {
          }
        });
      }
    } catch (e) {
    }

    const hasM3u8 = m3u8Qualities.length > 0;

    const allQualSet = new Set([...(qualities || []), ...(m3u8Qualities || [])]);
    const allQuals = sortQualities(Array.from(allQualSet));

    const combined = {};
    const qualityLabels = {};

    allQuals.forEach((q) => {
      try {
        if (m3u8srcs[q]) {
          combined[q] = { url: m3u8srcs[q].url, mimeType: m3u8srcs[q].mimeType, isM3u8: true };
          qualityLabels[q] = `[${q}]`;
        }

        if (srcs[q]) {
          if (m3u8srcs[q]) {
            const key2 = `${q}_2`;
            combined[key2] = srcs[q];
            qualityLabels[key2] = `[${q}2]`;
          } else {
            combined[q] = srcs[q];
            qualityLabels[q] = q;
          }
        }
      } catch (e) {
      }
    });

    const combinedKeys = Object.keys(combined);
    const muxedKeys = combinedKeys.filter((q) => combined[q]?.url);
    const sortedMuxedKeys = sortQualities(muxedKeys.map((q) => q.replace(/_2$/, "")));
    let defaultQuality = "";
    if (sortedMuxedKeys[0]) {
      const base = sortedMuxedKeys[0];
      defaultQuality = combined[base] ? base : (combined[`${base}_2`] ? `${base}_2` : base);
    } else if (combined["1080p"] || combined["1080p_2"]) {
      defaultQuality = combined["1080p"] ? "1080p" : "1080p_2";
    } else {
      const sortedCombinedKeys = sortQualities(combinedKeys.map((q) => q.replace(/_2$/, "")));
      const base = sortedCombinedKeys[0] || "";
      if (base) {
        defaultQuality = combined[base] ? base : (combined[`${base}_2`] ? `${base}_2` : base);
      }
    }

    return {
      sources: combined,
      availableQualities: Object.keys(combined).sort((a, b) => {
        const aNum = parseInt(a.replace(/_2$/, ""));
        const bNum = parseInt(b.replace(/_2$/, ""));
        if (bNum !== aNum) return bNum - aNum;
        return a.includes("_2") ? 1 : -1;
      }),
      qualityLabels,
      defaultQuality,
      hasM3u8,
    };
  } catch (e) {}
  return {
    sources: {},
    availableQualities: [],
    qualityLabels: {},
    defaultQuality: "",
    hasM3u8: false,
  };
}
