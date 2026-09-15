import { onScopeDispose, watch } from "vue";

function getArtwork(thumbnailUrl) {
  if (!thumbnailUrl) return [];
  try {
    const src = new URL(thumbnailUrl, globalThis.document?.baseURI);
    if (!["https:", "http:", "data:", "blob:"].includes(src.protocol)) return [];
    // Dimensions and MIME type are omitted because API thumbnails can vary.
    return [{ src: src.href }];
  } catch {
    return [];
  }
}

export function useMediaSessionMetadata(getMetadata) {
  let ownedMetadata = null;
  const mediaSession = globalThis.navigator?.mediaSession;

  function clearMetadata() {
    if (ownedMetadata && mediaSession?.metadata === ownedMetadata) {
      mediaSession.metadata = null;
    }
    ownedMetadata = null;
  }

  function updateMetadata() {
    if (!mediaSession || typeof globalThis.MediaMetadata !== "function") return;
    const { videoId, title, artist, thumbnailUrl } = getMetadata();
    if (!videoId) {
      clearMetadata();
      return;
    }
    try {
      const metadata = new MediaMetadata({
        title: title || "",
        artist: artist || "",
        artwork: getArtwork(thumbnailUrl),
      });
      mediaSession.metadata = metadata;
      ownedMetadata = metadata;
    } catch {
      // Metadata support must never interrupt media playback.
      clearMetadata();
    }
  }

  watch(getMetadata, updateMetadata, { immediate: true, deep: true });
  onScopeDispose(clearMetadata);
  return { updateMetadata };
}
