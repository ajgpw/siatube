// Backward-compatible facade for older callers. All remote traffic is routed
// to the documented SiaTube API; custom/JSONP endpoint selection is retired.
import { SIATUBE_API_ORIGIN } from "@/config/api.js";
import {
  channel,
  comments,
  playlist,
  search,
  stream,
  video,
} from "@/services/api/siatubeApi.js";
import { getPlaylistById } from "@/services/storage/playlistManager.js";
import { arrayBufferToDataUrl } from "@/utils/imageEncoding.js";

const STORAGE_KEY = "custom_api_endpoints_v1";
const MODE_KEY = "api_mode_v1";

export function loadCustomEndpoints() {
  return [];
}

export function saveCustomEndpoints() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function loadMode() {
  return "existing";
}

export function saveMode() {
  try {
    localStorage.setItem(MODE_KEY, "existing");
  } catch {}
}

export function getEffectiveApiUrl() {
  return SIATUBE_API_ORIGIN;
}

export function buildUrl(base, params = {}) {
  const url = new URL(base, SIATUBE_API_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (key === "__rawQuery" || value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function localPlaylist(id) {
  const localId = id.slice("local-".length);
  if (!/^\d+$/.test(localId)) throw new Error("Invalid local playlist ID");
  const custom = await getPlaylistById(Number(localId));
  if (!custom) throw new Error("プレイリストが見つかりません");
  return {
    title: custom.name,
    playlistId: id,
    totalItems: custom.items.length,
    items: custom.items.map((item) => ({
      videoId: item.id,
      title: item.title,
      author: item.authorName,
      thumbnail: arrayBufferToDataUrl(item.thumbnailBinary),
      duration: null,
      views: item.views || null,
      published: item.published || null,
    })),
    nextToken: null,
    isCustom: true,
  };
}

function parseEmbedded(rawQuery, resource) {
  const prefix = `${resource}=`;
  if (!rawQuery.startsWith(prefix)) return null;
  const parts = rawQuery.slice(prefix.length).split("==p==");
  const result = { id: parts.shift() || "" };
  for (const part of parts) {
    const marker = part.indexOf("==i==");
    if (marker === -1) continue;
    result[part.slice(0, marker)] = part.slice(marker + "==i==".length);
  }
  return result;
}

export async function apiRequest(options = {}) {
  const params = options.params || {};
  const requestOptions = {
    timeout: options.timeout,
    retries: options.retries,
    signal: options.signal,
  };

  if (typeof params.playlist === "string" && params.playlist.startsWith("local-")) {
    return localPlaylist(params.playlist);
  }
  if (params.q) return search(params.q, requestOptions);
  if (params.comments) return comments(params.comments, requestOptions);
  if (params.channel) return channel(params.channel, requestOptions);
  if (params.playlist) return playlist(params.playlist, { ...requestOptions, v: params.v });
  if (params.stream || params.stream2) return stream(params.stream || params.stream2, requestOptions);

  if (typeof params.__rawQuery === "string") {
    const videoRequest = parseEmbedded(params.__rawQuery, "video");
    if (videoRequest) {
      return video(videoRequest.id, {
        ...requestOptions,
        token: videoRequest.token,
        depth: videoRequest.depth,
      });
    }
    const playlistRequest = parseEmbedded(params.__rawQuery, "playlist");
    if (playlistRequest) {
      if (playlistRequest.id.startsWith("local-")) return localPlaylist(playlistRequest.id);
      return playlist(playlistRequest.id, {
        ...requestOptions,
        token: playlistRequest.token,
        v: playlistRequest.v,
      });
    }
  }

  throw new Error("Unsupported legacy API request");
}

export { STORAGE_KEY as __STORAGE_KEY__ };
