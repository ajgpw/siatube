export const TYPE2_STREAM_REQUEST_COOLDOWN_MS = 30_000;

let nextRequestAt = 0;
let lastVideoId = null;

export function claimType2StreamRequestSlot(videoId, now = Date.now()) {
  const current = Number(now);
  if (!Number.isFinite(current)) return TYPE2_STREAM_REQUEST_COOLDOWN_MS;

  const remaining = Math.max(0, nextRequestAt - current);
  // 同じ動画の再取得は許可し、別の動画への切替だけ間隔を制限する。
  if (remaining > 0 && videoId !== lastVideoId) return remaining;

  lastVideoId = videoId;
  nextRequestAt = current + TYPE2_STREAM_REQUEST_COOLDOWN_MS;
  return 0;
}

export function resetType2StreamRequestCooldown() {
  nextRequestAt = 0;
  lastVideoId = null;
}
