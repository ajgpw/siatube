import { proxiedRequestUrl } from "../../services/network/requestProxy.js";

export function selectPlaybackSubtitleTracks(tracks, automaticLimit = 5) {
  const list = Array.isArray(tracks) ? tracks : [];
  const manual = list.filter((track) => track?.automatic !== true);
  const automatic = list
    .filter((track) => track?.automatic === true)
    .slice(0, Math.max(0, Number(automaticLimit) || 0));
  return [...manual, ...automatic];
}

export async function localizeSubtitleTracks(tracks) {
  const localized = await Promise.all(
    (Array.isArray(tracks) ? tracks : []).map(async (track) => {
      try {
        const response = await fetch(proxiedRequestUrl(track.src), {
          headers: { Accept: "text/vtt,text/plain;q=0.9" },
          credentials: "omit",
        });
        if (!response.ok) return null;
        const text = await response.text();
        if (!text.trim()) return null;
        const objectUrl = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
        return { ...track, src: objectUrl, objectUrl };
      } catch {
        return null;
      }
    })
  );
  return localized.filter(Boolean);
}

export function revokeSubtitleTracks(tracks) {
  for (const track of Array.isArray(tracks) ? tracks : []) {
    if (!track?.objectUrl) continue;
    try { URL.revokeObjectURL(track.objectUrl); } catch (e) {}
  }
}
