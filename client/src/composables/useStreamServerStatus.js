import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { streamStatus as fetchStreamStatus } from "@/services/siatubeApi";
import {
  estimateStreamWaitMs,
  normalizeStreamStatus,
} from "@/utils/streamStatus";

const STATUS_INTERVAL_MS = 60_000;

export function useStreamServerStatus(getVideoId) {
  const serverStatus = ref(null);
  const statusError = ref(false);
  const statusFetchedAt = ref(0);
  const clock = ref(Date.now());
  let statusTimer = null;
  let clockTimer = null;
  let disposed = false;

  const title = computed(() => {
    if (!serverStatus.value && !statusError.value) {
      return "サーバー状況を確認しています…";
    }
    if (statusError.value && !serverStatus.value) {
      return "サーバー状況を取得できませんでした";
    }
    const count = serverStatus.value?.processing?.count || 0;
    return count === 0
      ? "サーバーは空いています"
      : `サーバーで${count}件を処理中です`;
  });

  const detail = computed(() => {
    const ids = serverStatus.value?.processing?.ids || [];
    const ownIndex = ids.indexOf(getVideoId());
    if (ownIndex < 0) return "";
    return `この動画を処理中です（${ownIndex + 1}番目）`;
  });

  const estimatedWaitText = computed(() => {
    if (!serverStatus.value) return "";
    const elapsed = Math.max(0, clock.value - statusFetchedAt.value);
    const waitMs = estimateStreamWaitMs(
      serverStatus.value,
      getVideoId(),
      elapsed,
    );
    if (waitMs <= 0) return "まもなく完了予定";
    return `約${Math.max(1, Math.ceil(waitMs / 1000))}秒`;
  });

  async function updateStatus() {
    try {
      const data = await fetchStreamStatus({ retries: 0, timeout: 10_000 });
      if (disposed) return;
      serverStatus.value = normalizeStreamStatus(data);
      statusFetchedAt.value = Date.now();
      clock.value = statusFetchedAt.value;
      statusError.value = false;
    } catch {
      if (!disposed) statusError.value = true;
    }
  }

  onMounted(() => {
    void updateStatus();
    statusTimer = window.setInterval(updateStatus, STATUS_INTERVAL_MS);
    clockTimer = window.setInterval(() => {
      clock.value = Date.now();
    }, 1_000);
  });

  onBeforeUnmount(() => {
    disposed = true;
    if (statusTimer !== null) window.clearInterval(statusTimer);
    if (clockTimer !== null) window.clearInterval(clockTimer);
    statusTimer = null;
    clockTimer = null;
  });

  return {
    estimatedWaitText,
    statusClock: clock,
    streamStatusDetail: detail,
    streamStatusTitle: title,
  };
}
