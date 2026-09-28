export const STREAM_PROCESSING_ESTIMATE_MS = 5_000;

export function normalizeStreamStatus(data) {
  const processing = data?.processing;
  const ids = Array.isArray(processing?.ids)
    ? processing.ids.filter((id) => typeof id === "string" && id)
    : [];
  const reportedCount = Number(processing?.count);

  return {
    status: data?.status === "ok" ? "ok" : "unknown",
    generatedAt: typeof data?.generatedAt === "string" ? data.generatedAt : "",
    processing: {
      count: Number.isFinite(reportedCount) && reportedCount >= 0
        ? Math.max(Math.floor(reportedCount), ids.length)
        : ids.length,
      ids,
      longest: processing?.longest && typeof processing.longest === "object"
        ? processing.longest
        : null,
    },
  };
}

export function estimateStreamWaitMs(status, videoId, elapsedSinceStatusMs = 0) {
  const normalized = normalizeStreamStatus(status);
  const { count, ids, longest } = normalized.processing;
  const ownIndex = ids.indexOf(videoId);
  if (count === 0) return STREAM_PROCESSING_ESTIMATE_MS;

  const longestDuration = Number(longest?.durationMs);
  const oldestIsLongest = ids.length === 0 || !longest?.videoid ||
    longest.videoid === ids[0];
  const elapsed = oldestIsLongest && Number.isFinite(longestDuration)
    ? Math.max(0, longestDuration) + Math.max(0, elapsedSinceStatusMs)
    : 0;
  const firstRemaining = Math.max(0, STREAM_PROCESSING_ESTIMATE_MS - elapsed);

  if (ownIndex >= 0) {
    return firstRemaining + ownIndex * STREAM_PROCESSING_ESTIMATE_MS;
  }

  // 現在処理中のIDが終わった後に、この動画自体を処理する時間も含める。
  return firstRemaining + count * STREAM_PROCESSING_ESTIMATE_MS;
}
