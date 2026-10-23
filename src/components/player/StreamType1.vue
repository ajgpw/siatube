<template>
  <div v-if="error" class="error-box" role="alert">
    ⚠️ {{ error }}
    <button @click="reloadStream" class="reload-button">再取得</button>
  </div>
  <div
    v-else-if="streamUrl"
    class="video-container"
    @mouseenter="showSettingsBox"
  >
    <div ref="playerHostRef" class="player-host">
      <iframe
        :key="iframeRenderKey"
        ref="iframeRef"
        :src="streamUrl"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        :title="videoTitle || '動画ストリーム'"
        @load="iframeLoaded = true"
      ></iframe>
    </div>
    <div
      v-if="showUnmutePrompt"
      class="unmute-prompt"
      @click.stop="handleUnmuteClick"
    >
      ミュートを解除する
    </div>
    <PlayerSettings :visible="settingsVisible || capturePending" @interaction="showSettingsBox">
      <label>
        アンビエントライト:
        <input
          type="checkbox"
          :checked="captureEnabled"
          :disabled="!captureSupported || captureReducedMotion || !iframeLoaded"
          aria-describedby="education-ambient-help"
          @change="handleAmbientLightChange"
        />
      </label>
      <small id="education-ambient-help" class="ambient-capture-help">
        <template v-if="!captureSupported">このブラウザではタブ共有による映像連動を利用できません。</template>
        <template v-else-if="captureReducedMotion">端末の「視差効果を減らす」設定が有効です。</template>
        <template v-else>オンにするたびに、共有画面で「このタブ」を選んで許可してください。</template>
      </small>
      <small v-if="capturePending" class="ambient-capture-help" role="status">共有の許可を待っています…</small>
      <small v-if="captureError" class="ambient-capture-help" role="alert">{{ captureError }}</small>
      <label>
        繰り返し:
        <input type="checkbox" v-model="repeatEnabled" />
      </label>
      <label :class="{ 'autoplay-disabled': repeatEnabled }">
        自動再生:
        <input
          type="checkbox"
          v-model="autoplayEnabled"
          :disabled="repeatEnabled"
        />
      </label>
      <button @click="reloadStream" class="reload-button">再読込み</button>
    </PlayerSettings>
    <PlayerLoading v-if="!iframeLoaded" overlay />
  </div>
  <PlayerLoading v-else-if="loading" />
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import PlayerSettings from "@/components/player/PlayerSettings.vue";
import PlayerLoading from "@/components/player/PlayerLoading.vue";
import { useAmbientLight } from "@/composables/useAmbientLight.js";
import {
  startEducationAmbientCapture,
  supportsEducationAmbientCapture,
} from "@/utils/player/educationAmbientCapture.js";
import { youtubeEducationStream } from "@/services/api/siatubeApi.js";
import {
  getAutoplayCandidateId,
  pushToAutoplayHistory,
} from "@/utils/player/autoplayManager.js";
import {
  AUTOPLAY_SETTING_EVENT,
  AMBIENT_LIGHT_SETTING_EVENT,
  AMBIENT_LIGHT_STORAGE_KEY,
  loadAmbientLight,
  loadAutoplay,
  saveAutoplay,
} from "@/services/storage/settingsManager.js";
import {
  configureYoutubeEducationEmbedUrl,
  ensureYoutubeEducationPlayerApi,
  loadYoutubeEducationPlayerData,
} from "@/utils/player/youtubeEducationPlayer.js";

const props = defineProps({
  videoId: { type: String, required: true },
  videoTitle: { type: String, default: "" },
});
const emit = defineEmits([
  "ended",
  "play-autoplay-candidate",
  "autoplay-no-suitable-video",
  "ambient-source",
]);

const streamUrl = ref("");
const error = ref("");
const loading = ref(false);
const iframeLoaded = ref(false);
const iframeRef = ref(null);
const playerHostRef = ref(null);
const iframeRenderKey = ref(0);
const autoplayEnabled = ref(loadAutoplay());
const { enabled: ambientLightEnabled, setEnabled: setAmbientLightEnabled } = useAmbientLight();
// Screen-sharing permission is deliberately requested afresh for each session.
const captureEnabled = ref(false);
const capturePending = ref(false);
const captureError = ref("");
const captureSupported = ref(false);
const captureReducedMotion = ref(false);
const repeatEnabled = ref(false);
const settingsVisible = ref(true);
const showUnmutePrompt = ref(false);

let player = null;
let playerReady = false;
let requestSequence = 0;
let endedHandled = false;
let settingsHideTimer = null;
const repeatRestartTimers = new Set();
const autoplayStartTimers = new Set();
const USER_GESTURE_KEY = "yt_user_gesture_v1";
let captureSession = null;
let captureController = null;
let captureSequence = 0;
let captureDisposed = false;
let captureMotionQuery = null;

function stopAmbientCapture() {
  captureSequence += 1;
  captureController?.abort();
  captureController = null;
  captureSession?.stop();
  captureSession = null;
  captureEnabled.value = false;
  capturePending.value = false;
  captureError.value = "";
  emit("ambient-source", null);
}

function captureErrorMessage(captureFailure) {
  if (captureFailure?.name === "NotAllowedError") {
    return "共有が許可されませんでした。オンにして「このタブ」を選び直してください。";
  }
  if (captureFailure?.code === "EDUCATION_CAPTURE_CURRENT_TAB") {
    return "現在開いているこのタブを選択してください。画面全体や別のタブでは開始できません。";
  }
  if (captureFailure?.code === "EDUCATION_CAPTURE_UNSUPPORTED") {
    return "このブラウザではタブ共有による映像連動を利用できません。";
  }
  return "共有映像を利用できませんでした。もう一度オンにしてください。";
}

async function handleAmbientLightChange(event) {
  if (!event.target.checked) {
    stopAmbientCapture();
    return;
  }
  if (captureDisposed || capturePending.value || captureEnabled.value) return;
  captureError.value = "";
  const host = playerHostRef.value;
  if (!host || captureReducedMotion.value || !supportsEducationAmbientCapture()) {
    event.target.checked = false;
    captureError.value = host && !captureReducedMotion.value
      ? "このブラウザではタブ共有による映像連動を利用できません。"
      : "プレイヤーを表示してから、もう一度オンにしてください。";
    showSettingsBox();
    return;
  }

  const sequence = ++captureSequence;
  const controller = new AbortController();
  captureController = controller;
  captureEnabled.value = true;
  capturePending.value = true;
  try {
    // Invoke the browser chooser inside this user gesture, before any await.
    const session = await startEducationAmbientCapture(host, {
      signal: controller.signal,
      onEnded: (captureFailure) => {
        if (sequence !== captureSequence || captureDisposed) return;
        stopAmbientCapture();
        if (captureFailure?.code !== "EDUCATION_CAPTURE_ENDED") {
          captureError.value = captureFailure ? captureErrorMessage(captureFailure) : "";
          if (captureError.value) showSettingsBox();
        }
      },
    });
    if (sequence !== captureSequence || controller.signal.aborted || captureDisposed) {
      session.stop();
      return;
    }
    captureSession = session;
    capturePending.value = false;
    setAmbientLightEnabled(true);
    emit("ambient-source", { video: session.video, visibilityTarget: host });
  } catch (captureFailure) {
    if (sequence !== captureSequence || captureDisposed) return;
    stopAmbientCapture();
    captureError.value = captureErrorMessage(captureFailure);
    showSettingsBox();
  }
}

function syncCaptureMotionPreference() {
  captureReducedMotion.value = !!captureMotionQuery?.matches;
  if (captureReducedMotion.value) stopAmbientCapture();
}

function handleCaptureSettingChange(event) {
  if (event.type === "storage" && event.key !== AMBIENT_LIGHT_STORAGE_KEY && event.key !== null) return;
  const enabled = typeof event.detail?.enabled === "boolean"
    ? event.detail.enabled : loadAmbientLight();
  // An explicit OFF must also cancel a pending chooser when the master was
  // already OFF; a watcher alone cannot see an unchanged boolean value.
  if (!enabled && (capturePending.value || captureEnabled.value)) stopAmbientCapture();
}

function clearRepeatRestartTimers() {
  for (const timer of repeatRestartTimers) window.clearTimeout(timer);
  repeatRestartTimers.clear();
}

function clearAutoplayStartTimers() {
  for (const timer of autoplayStartTimers) window.clearTimeout(timer);
  autoplayStartTimers.clear();
}

function destroyPlayer() {
  playerReady = false;
  endedHandled = false;
  showUnmutePrompt.value = false;
  clearRepeatRestartTimers();
  clearAutoplayStartTimers();
  if (!player) return;
  try {
    player.destroy();
  } catch {}
  player = null;
}

function handlePlayerEnded() {
  if (endedHandled) return;
  endedHandled = true;

  if (repeatEnabled.value && player) {
    restartRepeatedVideo();
    return;
  }

  try {
    emit("ended");
  } catch {}
  pushToAutoplayHistory(props.videoId);
  if (!autoplayEnabled.value) return;

  const candidateId = getAutoplayCandidateId(props.videoId, {
    onNoSuitableVideo: () => emit("autoplay-no-suitable-video"),
  });
  if (candidateId) emit("play-autoplay-candidate", { id: candidateId });
}

function scheduleRepeatRestartAttempt(delay, { seek = false } = {}) {
  const timer = window.setTimeout(() => {
    repeatRestartTimers.delete(timer);
    if (!repeatEnabled.value || !player) return;
    try {
      if (player.getPlayerState?.() === 1) {
        endedHandled = false;
        clearRepeatRestartTimers();
        return;
      }
      if (seek) player.seekTo(0, true);
      player.playVideo();
    } catch {}
  }, delay);
  repeatRestartTimers.add(timer);
}

function restartRepeatedVideo() {
  clearRepeatRestartTimers();
  if (!player) return;
  try {
    player.seekTo(0, true);
    player.playVideo();
  } catch {}
  scheduleRepeatRestartAttempt(150);
  scheduleRepeatRestartAttempt(500, { seek: true });
  scheduleRepeatRestartAttempt(1000);
}

function hasStoredUserGesture() {
  try {
    return localStorage.getItem(USER_GESTURE_KEY) === "1";
  } catch {
    return false;
  }
}

function startPlayerPlayback(target = player) {
  if (!target) return;
  try {
    if (!hasStoredUserGesture()) {
      target.mute();
      showUnmutePrompt.value = true;
    }
    target.playVideo();
  } catch {}
}

function scheduleAutoplayStart(sequence, target) {
  clearAutoplayStartTimers();
  if (!autoplayEnabled.value || !target) return;
  startPlayerPlayback(target);
  // IFrame API が ready を通知しても、動画がまだ cue 中の場合がある。
  for (const delay of [300, 1000]) {
    const timer = window.setTimeout(() => {
      autoplayStartTimers.delete(timer);
      if (sequence !== requestSequence || !autoplayEnabled.value || !playerReady) return;
      try {
        const state = target.getPlayerState?.();
        if (state === -1 || state === 5) startPlayerPlayback(target);
      } catch {}
    }, delay);
    autoplayStartTimers.add(timer);
  }
}

function handleUnmuteClick() {
  try {
    localStorage.setItem(USER_GESTURE_KEY, "1");
  } catch {}
  showUnmutePrompt.value = false;
  try {
    player?.unMute();
    player?.playVideo();
  } catch {}
}

function initializePlayer(sequence) {
  if (
    sequence !== requestSequence ||
    !iframeRef.value ||
    !window.YT ||
    typeof window.YT.Player !== "function"
  ) {
    return;
  }

  destroyPlayer();
  player = new window.YT.Player(iframeRef.value, {
    events: {
      onReady: (event) => {
        if (sequence !== requestSequence) return;
        playerReady = true;
        if (autoplayEnabled.value) scheduleAutoplayStart(sequence, event.target);
        else if (repeatEnabled.value) startPlayerPlayback(event.target);
      },
      onStateChange: (event) => {
        if (sequence !== requestSequence) return;
        if (event.data === 1) {
          endedHandled = false;
          clearRepeatRestartTimers();
          clearAutoplayStartTimers();
        }
        if (event.data === 5 && autoplayEnabled.value) {
          startPlayerPlayback(event.target);
        }
        if (event.data === 0) handlePlayerEnded();
      },
      onError: (event) => {
        console.warn("YouTube Education Player API error:", event.data);
      },
    },
  });
}

async function fetchEducationStream(id, sequence) {
  const data = await youtubeEducationStream(id, {
    retries: 1,
    timeout: 60000,
  });
  if (sequence !== requestSequence) return;
  const url = typeof data === "string" ? data : data?.url;
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("YouTube EducationのURLが空です (JSON)");
  }
  streamUrl.value = configureYoutubeEducationEmbedUrl(url, {
    autoplay: autoplayEnabled.value,
  });
  iframeRenderKey.value += 1;
}

async function fetchStream(id, forceRefresh = false) {
  const sequence = ++requestSequence;
  stopAmbientCapture();
  destroyPlayer();
  streamUrl.value = "";
  error.value = "";
  loading.value = true;
  iframeLoaded.value = false;

  try {
    await fetchEducationStream(id, sequence);
    if (sequence !== requestSequence) return;

    let playerData = null;
    try {
      playerData = await loadYoutubeEducationPlayerData({ forceRefresh });
    } catch (sheetError) {
      console.warn("スプレッドシート取得失敗:", sheetError);
    }
    if (sequence !== requestSequence) return;

    await nextTick();
    if (sequence !== requestSequence) return;

    try {
      await ensureYoutubeEducationPlayerApi(playerData?.widgetApiSource);
      await nextTick();
      initializePlayer(sequence);
    } catch (playerApiError) {
      // 埋め込み自体は再生可能なので、APIだけ失敗した場合はiframeを残す。
      console.warn("IFrame Player API初期化失敗:", playerApiError);
    }
  } catch (streamError) {
    if (sequence !== requestSequence) return;
    if (streamError?.connectionFailure) {
      error.value = streamError.message;
    } else if (streamError?.name === "AbortError") {
      error.value = "ストリームURLの取得に失敗しました (タイムアウト)";
    } else {
      error.value = streamError?.message ||
        "ストリームURLの取得に失敗しました (fetch error)";
    }
  } finally {
    if (sequence === requestSequence) loading.value = false;
  }
}

function reloadStream() {
  fetchStream(props.videoId, true);
}

function handleAutoplaySettingChange(event) {
  const enabled = event?.detail?.enabled;
  const nextEnabled = typeof enabled === "boolean" ? enabled : loadAutoplay();
  if (nextEnabled && repeatEnabled.value) repeatEnabled.value = false;
  autoplayEnabled.value = nextEnabled;
}

function showSettingsBox() {
  settingsVisible.value = true;
  if (settingsHideTimer !== null) window.clearTimeout(settingsHideTimer);
  settingsHideTimer = window.setTimeout(() => {
    settingsVisible.value = false;
    settingsHideTimer = null;
  }, 3000);
}

onMounted(() => {
  captureSupported.value = supportsEducationAmbientCapture();
  captureMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  syncCaptureMotionPreference();
  if (captureMotionQuery?.addEventListener) captureMotionQuery.addEventListener("change", syncCaptureMotionPreference);
  else captureMotionQuery?.addListener?.(syncCaptureMotionPreference);
  window.addEventListener("pagehide", stopAmbientCapture);
  window.addEventListener(AMBIENT_LIGHT_SETTING_EVENT, handleCaptureSettingChange);
  window.addEventListener("storage", handleCaptureSettingChange);
  window.addEventListener(AUTOPLAY_SETTING_EVENT, handleAutoplaySettingChange);
  window.addEventListener("mousemove", showSettingsBox);
  window.addEventListener("click", showSettingsBox);
  window.addEventListener("scroll", showSettingsBox);
  showSettingsBox();
});

onBeforeUnmount(() => {
  captureDisposed = true;
  stopAmbientCapture();
  window.removeEventListener("pagehide", stopAmbientCapture);
  window.removeEventListener(AMBIENT_LIGHT_SETTING_EVENT, handleCaptureSettingChange);
  window.removeEventListener("storage", handleCaptureSettingChange);
  if (captureMotionQuery?.removeEventListener) captureMotionQuery.removeEventListener("change", syncCaptureMotionPreference);
  else captureMotionQuery?.removeListener?.(syncCaptureMotionPreference);
  requestSequence += 1;
  window.removeEventListener(AUTOPLAY_SETTING_EVENT, handleAutoplaySettingChange);
  window.removeEventListener("mousemove", showSettingsBox);
  window.removeEventListener("click", showSettingsBox);
  window.removeEventListener("scroll", showSettingsBox);
  if (settingsHideTimer !== null) window.clearTimeout(settingsHideTimer);
  destroyPlayer();
});

watch(ambientLightEnabled, (enabled) => {
  if (!enabled) stopAmbientCapture();
}, { flush: "sync" });

watch(repeatEnabled, (enabled) => {
  if (enabled) {
    autoplayEnabled.value = false;
    if (playerReady) startPlayerPlayback();
  } else {
    clearRepeatRestartTimers();
  }
});

watch(autoplayEnabled, (enabled) => {
  saveAutoplay(enabled);
  if (enabled && playerReady && player) {
    scheduleAutoplayStart(requestSequence, player);
  } else if (!enabled) {
    clearAutoplayStartTimers();
  }
});

watch(
  () => props.videoId,
  (newId) => {
    if (newId) fetchStream(newId);
  },
  { immediate: true },
);
</script>

<style scoped>
.video-container {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
}
.player-host {
  position: absolute;
  inset: 0;
}
.player-host iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.settings-box {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  box-sizing: border-box;
  min-width: 140px;
  padding: 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.75);
  color: var(--on-accent);
  font-size: 14px;
  transition: opacity 0.3s ease;
}
.autoplay-disabled {
  position: relative;
  color: rgba(255, 255, 255, 0.5);
}
.ambient-capture-help {
  max-width: 250px;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.5;
  font-size: 11px;
}
.autoplay-disabled::after {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 1px;
  background: rgba(255, 255, 255, 0.6);
  content: "";
  pointer-events: none;
  transform: translateY(-50%);
}
.unmute-prompt {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 50;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(128, 128, 128, 0.6);
  color: var(--on-accent);
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.error-box {
  color: var(--accent-weak);
  margin: 10px;
}
.reload-button {
  margin-top: 6px;
  padding: 6px 12px;
  font-size: 9px;
  background: var(--text-secondary);
  color: var(--on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 60%;
}
.reload-button:hover {
  background: var(--text-secondary-hover);
  color: var(--on-accent);
}
</style>
