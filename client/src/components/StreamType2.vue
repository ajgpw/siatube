<template>
  <div
    v-if="error"
    class="error-box"
    :class="{ 'premiere-scheduled': isPremiereScheduled }"
    role="alert"
    aria-live="polite"
  >
    <div class="error-title">
      {{ isPremiereScheduled ? "プレミア公開を待っています" : "⚠️ エラー" }}
    </div>
    <div class="error-message">{{ error }}</div>
    <div v-if="isPremiereScheduled && premiereScheduledText" class="premiere-scheduled-at">
      公開予定: {{ premiereScheduledText }}
    </div>
    <button
      v-if="!hideErrorReloadButton"
      @click="reloadStream"
      class="reload-button"
    >
      再取得
    </button>
  </div>
  <div v-else-if="selectedQuality && availableQualities.length > 0" class="video-container">
    <ExternalHlsPlayer v-if="externalM3u8Url" :url="externalM3u8Url" />
    <!-- single-stream (audio+video) が使える場合 -->
    <template v-else-if="isSingleStreamEntry(sources[selectedQuality])">
      <video
        ref="videoRef"
        playsinline
        webkit-playsinline
        controlslist="nofullscreen"
        @dblclick.prevent
        controls
        name="media"
        :crossorigin="selectedQualityHasM3u8() ? 'anonymous' : undefined"
        :preload="selectedQualityHasM3u8() ? 'auto' : 'metadata'"
        :autoplay="autoplayEnabled"
        :loop="repeatEnabled"
        :key="`${playerRenderKey}:${selectedQuality}:${appleSourceIndex}:${sources[selectedQuality]?.url || ''}`"
        @canplay="markPlayerReady"
        @loadedmetadata="markPlayerReady"
        @loadeddata="markPlayerReady"
        @play="handlePlaybackAttempt"
        @playing="markPlayerPlaying"
        @waiting="markPlayerBuffering"
        @error="handleVideoError"
      >
        <source
          v-for="s in getSingleStreamSources(sources[selectedQuality])"
          :key="s.url"
          :src="s.url"
          :type="getMediaSourceMimeType(s)"
          @error="handleSourceError"
        />
      </video>

      <div v-if="showUnmutePrompt" class="unmute-prompt" @click.stop="handleUnmuteClick">
        ミュートを解除する
      </div>

      <PlayerSettings :visible="settingsVisible" @interaction="showSettingsBox">
        <label>
          繰り返し:
          <input type="checkbox" v-model="repeatEnabled" />
        </label>
        <label :class="{ 'autoplay-disabled': repeatEnabled }">
          自動再生:
          <input type="checkbox" v-model="autoplayEnabled" :disabled="repeatEnabled" />
        </label>

        <button
          v-if="videoRef"
          type="button"
          class="pip-button"
          :disabled="!fullscreenSupported"
          @click="enterFullscreen"
        >全画面</button>
        <span v-if="fullscreenError" role="status">{{ fullscreenError }}</span>

        <button
          type="button"
          class="pip-button"
          :disabled="!pictureInPictureSupported"
          :title="pictureInPictureSupported
            ? 'ピクチャインピクチャを切り替える'
            : 'この動画またはブラウザはピクチャインピクチャに対応していません'"
          @click="togglePictureInPicture"
        >
          {{ pictureInPictureActive ? "PiPを終了" : "ピクチャインピクチャ" }}
        </button>

        <label>
          画質:
          <select v-model="selectedQuality" class="selector">
            <option v-for="q in availableQualities" :key="q" :value="q">
              {{ qualityLabels[q] || q }}
            </option>
          </select>
        </label>

        <label>
          字幕:
          <select v-model="selectedSubtitle" class="selector" :disabled="!videoRef || !subtitleTracks.length">
            <option value="">オフ</option>
            <option v-for="(track, index) in subtitleTracks" :key="track.src" :value="String(index)">
              {{ track.label || track.srclang || `字幕 ${index + 1}` }}
            </option>
          </select>
          <span v-if="!subtitleTracks.length">（字幕なし）</span>
        </label>

        <!-- 非 Apple デバイスでは再生速度選択を常に表示 -->
        <label v-if="!isAppleDevice()">
          再生速度:
          <select v-model.number="selectedPlaybackRate" class="selector">
            <option v-for="rate in playbackRates" :key="rate" :value="rate">
              {{ rate }}x
            </option>
          </select>
        </label>

        <button @click="reloadStream" class="reload-button">再読込み</button>
      </PlayerSettings>
      <div v-if="isQualitySwitching" class="block-overlay" aria-hidden="true"></div>
    </template>

    <!-- その他: videourl (video+audio) の再生 / audio-only -->
    <template v-else>
      <template v-if="isAudioOnlyEntry(sources[selectedQuality])">
        <div class="audio-only">
          <audio
            ref="audioRef"
            preload="auto"
            :autoplay="autoplayEnabled"
            controls
            :key="`${playerRenderKey}:audio:${selectedQuality}`"
            @canplay="markPlayerReady"
            @loadedmetadata="markPlayerReady"
            @loadeddata="markPlayerReady"
            @playing="markPlayerPlaying"
            @waiting="markPlayerBuffering"
          >
            <source
              :src="sources[selectedQuality]?.audio?.url"
              :type="sources[selectedQuality]?.audio?.mimeType"
            />
          </audio>
        </div>
      </template>
      <template v-else>
        <video
          ref="videoRef"
          playsinline
          webkit-playsinline
          controlslist="nofullscreen"
          @dblclick.prevent
          preload="auto"
          :autoplay="autoplayEnabled"
          controls
          name="media"
          :crossorigin="selectedQualityHasM3u8() ? 'anonymous' : undefined"
          :key="`${playerRenderKey}:${separateAvKey}:${selectedQuality}:${appleSourceIndex}:video`"
          @canplay="markPlayerReady"
          @loadedmetadata="markPlayerReady"
          @loadeddata="markPlayerReady"
          @play="handlePlaybackAttempt"
          @playing="markPlayerPlaying"
          @waiting="markPlayerBuffering"
          @error="handleVideoError"
        >
          <source
            v-for="s in getVideoSourcesForEntry(sources[selectedQuality])"
            :key="s.url"
            :src="s.url"
            :type="getMediaSourceMimeType(s)"
            @error="handleSourceError"
          />
        </video>
        <div v-if="showUnmutePrompt" class="unmute-prompt" @click.stop="handleUnmuteClick">
          ミュートを解除する
        </div>
        <audio
          ref="audioRef"
          preload="auto"
          style="display:none;"
          autoplay
          :key="`${playerRenderKey}:${separateAvKey}:audio`"
          @canplay="markPlayerReady"
          @loadedmetadata="markPlayerReady"
          @loadeddata="markPlayerReady"
          @playing="markPlayerPlaying"
          @waiting="markPlayerBuffering"
        >
          <source
            :src="sources[selectedQuality]?.audio?.url"
            :type="sources[selectedQuality]?.audio?.mimeType"
          />
        </audio>
      </template>

      <PlayerSettings :visible="settingsVisible" @interaction="showSettingsBox">
        <label>
          繰り返し:
          <input type="checkbox" v-model="repeatEnabled" />
        </label>
        <label :class="{ 'autoplay-disabled': repeatEnabled }">
          自動再生:
            <input type="checkbox" v-model="autoplayEnabled" :disabled="repeatEnabled" />
        </label>

        <button
          v-if="videoRef"
          type="button"
          class="pip-button"
          :disabled="!fullscreenSupported"
          @click="enterFullscreen"
        >全画面</button>
        <span v-if="fullscreenError" role="status">{{ fullscreenError }}</span>

        <button
          type="button"
          class="pip-button"
          :disabled="!pictureInPictureSupported"
          :title="pictureInPictureSupported
            ? 'ピクチャインピクチャを切り替える'
            : 'この動画またはブラウザはピクチャインピクチャに対応していません'"
          @click="togglePictureInPicture"
        >
          {{ pictureInPictureActive ? "PiPを終了" : "ピクチャインピクチャ" }}
        </button>

        <label>
          画質:
          <select v-model="selectedQuality" class="selector">
            <option v-for="q in availableQualities" :key="q" :value="q">
              {{ qualityLabels[q] || q }}
            </option>
          </select>
        </label>

        <label>
          字幕:
          <select v-model="selectedSubtitle" class="selector" :disabled="!videoRef || !subtitleTracks.length">
            <option value="">オフ</option>
            <option v-for="(track, index) in subtitleTracks" :key="track.src" :value="String(index)">
              {{ track.label || track.srclang || `字幕 ${index + 1}` }}
            </option>
          </select>
          <span v-if="!subtitleTracks.length">（字幕なし）</span>
        </label>

        <!-- 非 Apple デバイスでは再生速度選択を常に表示 -->
        <label v-if="!isAppleDevice()">
          再生速度:
          <select v-model.number="selectedPlaybackRate" class="selector">
            <option v-for="rate in playbackRates" :key="rate" :value="rate">
              {{ rate }}x
            </option>
          </select>
        </label>

        <button @click="reloadStream" class="reload-button">再読込み</button>
      </PlayerSettings>
      <div v-if="isQualitySwitching" class="block-overlay" aria-hidden="true"></div>
    </template>
    <PlayerLoading
      v-if="type2LoadingOverlayVisible"
      overlay
    />
  </div>
  <PlayerLoading v-else-if="loading">
    <div class="stream-status-panel">
      <div class="stream-status-title">{{ requestStatusTitle }}</div>
      <div v-if="requestState.phase === 'cooldown'" class="stream-status-detail">
        あと約{{ cooldownSeconds }}秒で取得を開始します。
      </div>
      <div v-else class="stream-status-detail">{{ streamStatusTitle }}</div>
      <div v-if="requestState.phase === 'requesting' && streamStatusDetail" class="stream-status-detail">
        {{ streamStatusDetail }}
      </div>
      <div v-if="requestState.phase === 'requesting' && estimatedWaitText" class="stream-status-wait">
        おおよその待ち時間: {{ estimatedWaitText }}
      </div>
    </div>
  </PlayerLoading>
</template>

<script setup>
import { computed, ref, watch, onMounted, nextTick, onBeforeUnmount } from "vue";
import { createVideoFullscreen } from "@/utils/videoFullscreen";
import PlayerSettings from "@/components/PlayerSettings.vue";
import ExternalHlsPlayer from "@/components/ExternalHlsPlayer.vue";
import PlayerLoading from "@/components/PlayerLoading.vue";
import {
  isVideoStreamError,
  stream as fetchStream,
} from "@/services/siatubeApi";
import { setupSyncPlayback } from "@/components/syncPlayback";
import { createPlaybackController } from "@/composables/playbackController";
import { useMediaSessionMetadata } from "@/composables/useMediaSessionMetadata";
import { useStreamServerStatus } from "@/composables/useStreamServerStatus";
import { parseStream2Response } from "@/utils/type2StreamParser";
import {
  extractSubtitleTracks,
  normalizeStreamFormats,
} from "@/utils/siatubeAdapters";
import {
  AUTOPLAY_SETTING_EVENT,
  loadAutoplay,
  loadPreferredQuality,
  saveAutoplay,
} from "@/utils/settingsManager";
import {
  getAutoplayCandidateId as selectAutoplayCandidateId,
  pushToAutoplayHistory,
} from "@/utils/autoplayManager";
import {
  localizeSubtitleTracks,
  revokeSubtitleTracks,
  selectPlaybackSubtitleTracks,
} from "@/utils/subtitleTracks";
import { bindSubtitleSelection } from "@/utils/subtitleSelection";
import { createType2StreamRequest } from "@/utils/type2StreamRequest";
import {
  getExternalM3u8Url,
  isAppleDevice as isAppleDeviceCheck,
  getMediaSourceMimeType,
  isM3u8PlaybackActive,
  isM3u8Source,
  selectNativeHlsSources,
  shouldMonitorM3u8Playback,
  getSingleStreamSourcesList,
  getVideoSourcesForEntryList,
  selectBestPlayableQuality,
} from "@/utils/streamType2Fallback";

const props = defineProps({
  videoId: { type: String, required: true },
  videoTitle: { type: String, default: "" },
  videoArtist: { type: String, default: "" },
  videoThumbnail: { type: String, default: "" },
});
const { updateMetadata } = useMediaSessionMetadata(() => ({
  videoId: props.videoId,
  title: props.videoTitle,
  artist: props.videoArtist,
  thumbnailUrl: props.videoThumbnail,
}));

const emit = defineEmits([
  "ended",
  "play-autoplay-candidate",
  "autoplay-no-suitable-video",
  "loading-timeout-reload",
]);
function reloadStream() {
  fetchStreamUrl(props.videoId, true);
}

const error = ref("");
const errorCode = ref("");
const errorExpiresAt = ref(0);
const isPremiereScheduled = computed(
  () => errorCode.value === "premiere_scheduled"
);
const hideErrorReloadButton = computed(
  () => isPremiereScheduled.value &&
    errorExpiresAt.value > 0 &&
    statusClock.value < errorExpiresAt.value
);
const premiereScheduledText = computed(() => {
  if (!isPremiereScheduled.value || errorExpiresAt.value <= 0) return "";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(errorExpiresAt.value));
  } catch {
    return "";
  }
});
const sources = ref({});
const selectedQuality = ref("");
const availableQualities = ref([]);
const qualityLabels = ref({}); // Map from internal key to display label
const subtitleTracks = ref([]);
const selectedSubtitle = ref("");
let subtitleSelection = null;
const selectedPlaybackRate = ref(1.0);
const playbackRates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4];
const diffText = ref("0");
const videoRef = ref(null);
const audioRef = ref(null);
let fullscreenController = null;
const fullscreenSupported = ref(false);
const fullscreenError = ref('');

async function enterFullscreen(event) {
  // Close the mobile settings dialog before entering the native video player.
  event.currentTarget.closest('dialog')?.close();
  fullscreenError.value = '';
  const controller = fullscreenController;
  if (controller && !await controller.enter() && controller === fullscreenController) {
    fullscreenError.value = '全画面に切り替えられませんでした。動画の再生後にもう一度お試しください。';
  }
}

const pictureInPictureActive = ref(false);
const pictureInPictureSupported = computed(() => {
  const video = videoRef.value;
  if (!video) return false;
  return Boolean(
    (document.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === 'function') ||
    typeof video.webkitSetPresentationMode === 'function'
  );
});
const separateAvKey = ref(0);
// サーバー応答後に media 要素を確実に作り直すためのキー。
// 待機画面から復帰するときに古い video/audio の内部状態を持ち越さない。
const playerRenderKey = ref(0);
const appleFallbackActive = ref(false);
const appleSourceIndex = ref(0);
let lastAppleFallbackAttemptTime = 0;
const m3u8PlaybackDisabled = ref(false);
const m3u8PlaybackAttempted = ref(false);
const M3U8_PLAYBACK_TIMEOUT_MS = 8_000;
const TYPE2_LOADING_RELOAD_TIMEOUT_MS = 6_000;
let m3u8LoadTimer = null;
let type2LoadingReloadTimer = null;
const INITIAL_PLAYBACK_RECOVERY_DELAY_MS = 1500;
let initialPlaybackRecoveryTimer = null;
let initialPlaybackRecovery = null;
let initialPlaybackRecoveryRunning = false;
const repeatEnabled = ref(false);
const autoplayEnabled = ref(loadAutoplay());
const requestState = ref({ phase: "idle", waitUntil: 0 });
const loading = computed(() => ["cooldown", "requesting", "preparing"].includes(requestState.value.phase));
const playerReady = ref(false);
const playerBuffering = ref(false);
const playbackEstablished = ref(false);
const { estimatedWaitText, statusClock, streamStatusDetail, streamStatusTitle } =
  useStreamServerStatus(() => props.videoId);
const requestStatusTitle = computed(() => ({
  cooldown: "次のストリームURL取得まで待機しています…",
  requesting: "ストリームURLを取得しています…",
  preparing: "取得したストリームを準備しています…",
}[requestState.value.phase] || ""));
const cooldownSeconds = computed(() => Math.max(
  0, Math.ceil((requestState.value.waitUntil - statusClock.value) / 1000),
));
const muxedFallbackSources = ref([]);
const externalM3u8Url = computed(() => getExternalM3u8Url(
  sources.value, availableQualities.value, selectedQuality.value, muxedFallbackSources.value,
));
let setupFailureCount = 0;
let muxedFallbackAttempted = false;
let muxedFallbackSelectionPending = false;
const type2LoadingOverlayVisible = computed(() => Boolean(
  selectedQuality.value &&
  availableQualities.value.length > 0 &&
  !playbackEstablished.value &&
  !selectedQualityHasM3u8() &&
  (!playerReady.value || playerBuffering.value)
));
const isQualitySwitching = ref(false);
const showUnmutePrompt = ref(false);
const settingsVisible = ref(true);
const USER_GESTURE_KEY = 'yt_user_gesture_v1';
let _onEndedAttached = false;
let streamRequestSequence = 0;
let playbackConfirmationTimer = null;

function clearPlaybackConfirmationTimer() {
  if (playbackConfirmationTimer !== null) {
    window.clearTimeout(playbackConfirmationTimer);
    playbackConfirmationTimer = null;
  }
}

function clearType2LoadingReloadTimer() {
  if (type2LoadingReloadTimer !== null) {
    window.clearTimeout(type2LoadingReloadTimer);
    type2LoadingReloadTimer = null;
  }
}

function scheduleType2LoadingReload(sequence) {
  clearType2LoadingReloadTimer();
  // HLSは専用のロード監視に任せる。通常ストリーム向けの短い再マウントを
  // 適用すると、HLSの初期バッファリング中にプレイヤーが破棄されてしまう。
  if (selectedQualityHasM3u8()) return;
  type2LoadingReloadTimer = window.setTimeout(() => {
    type2LoadingReloadTimer = null;
    if (sequence !== streamRequestSequence || error.value || playbackEstablished.value) {
      return;
    }
    if (type2LoadingOverlayVisible.value && !selectedQualityHasM3u8()) {
      emit("loading-timeout-reload");
    }
  }, TYPE2_LOADING_RELOAD_TIMEOUT_MS);
}

function clearInitialPlaybackRecovery() {
  if (initialPlaybackRecoveryTimer !== null) {
    window.clearTimeout(initialPlaybackRecoveryTimer);
    initialPlaybackRecoveryTimer = null;
  }
  initialPlaybackRecovery = null;
  initialPlaybackRecoveryRunning = false;
}

function hasPlayableDuration(mediaEl = videoRef.value || audioRef.value) {
  if (!mediaEl) return false;
  const duration = mediaEl.duration;
  return duration === Infinity ||
    (Number.isFinite(duration) && duration > 0);
}

function isPrimaryMediaElement(mediaEl) {
  return mediaEl === videoRef.value ||
    (!videoRef.value && mediaEl === audioRef.value);
}

function scheduleInitialPlaybackRecovery() {
  if (!initialPlaybackRecovery) return;
  if (initialPlaybackRecoveryTimer !== null) {
    window.clearTimeout(initialPlaybackRecoveryTimer);
  }
  initialPlaybackRecoveryTimer = window.setTimeout(
    recoverInitialPlayback,
    INITIAL_PLAYBACK_RECOVERY_DELAY_MS
  );
}

function beginInitialPlaybackRecovery(sequence, id, quality) {
  clearInitialPlaybackRecovery();
  if (!quality) return;
  initialPlaybackRecovery = { sequence, id, quality };
  scheduleInitialPlaybackRecovery();
}

async function recoverInitialPlayback() {
  initialPlaybackRecoveryTimer = null;
  const context = initialPlaybackRecovery;
  if (!context || hasPlayableDuration()) {
    clearInitialPlaybackRecovery();
    return;
  }
  if (
    context.sequence !== streamRequestSequence ||
    context.id !== props.videoId ||
    selectedQuality.value !== context.quality
  ) {
    clearInitialPlaybackRecovery();
    return;
  }

  // HLSは起動に時間がかかるため、Apple端末のURL切替よりも先に除外する。
  if (isCurrentlyUsingM3u8()) {
    // 1.5秒の初期復旧では失敗扱いにせず、再生操作後の専用タイムアウトに任せる。
    clearInitialPlaybackRecovery();
    return;
  }

  // Apple端末の場合、現在の画質内の残りの単一URLを順々に試す
  if (isAppleDevice()) {
    const triedNext = tryNextAppleSource();
    if (triedNext) return;
  }

  // 再生可能な画質を検索（空URLの画質は除外される）
  const fallbackQuality = selectBestPlayableQuality(
    sources.value,
    availableQualities.value.filter((q) => q !== context.quality),
    "",
    { useM3u8: useM3u8Playback() }
  );

  if (!fallbackQuality) {
    clearInitialPlaybackRecovery();
    return;
  }
  initialPlaybackRecoveryRunning = true;
  selectedQuality.value = "";
  await nextTick();
  if (
    context.sequence !== streamRequestSequence ||
    context.id !== props.videoId
  ) {
    clearInitialPlaybackRecovery();
    return;
  }
  appleFallbackActive.value = false;
  appleSourceIndex.value = 0;
  playerRenderKey.value += 1;
  initialPlaybackRecovery.quality = fallbackQuality;
  selectedQuality.value = fallbackQuality;
  initialPlaybackRecoveryRunning = false;
  // 自動復旧は一度だけ。以降は通常のブラウザ側エラー表示に任せる。
  initialPlaybackRecovery = null;
}

const endedHandler = {
  fn: async () => {
    try { emit('ended'); } catch (e) {}
    try { pushToAutoplayHistory(props.videoId); } catch (e) {}
    if (!autoplayEnabled.value) return;
    try {
      const candId = getAutoplayCandidateId();
      if (!candId) return;
      emit('play-autoplay-candidate', { id: candId });
    } catch (e) {}
  }
};

let _onEnded = async () => { await endedHandler.fn(); };

// 自動再生候補選定
// window.__autoplayCandidates があればそこから選ぶ。ないなら DOM の data-video-id から選ぶ。
function getAutoplayCandidateId() {
  return selectAutoplayCandidateId(props.videoId, {
    onNoSuitableVideo: () => emit('autoplay-no-suitable-video'),
  });
}

function handleAutoplaySettingChange(event) {
  const enabled = event?.detail?.enabled;
  const nextEnabled = typeof enabled === 'boolean' ? enabled : loadAutoplay();
  if (nextEnabled && repeatEnabled.value) repeatEnabled.value = false;
  autoplayEnabled.value = nextEnabled;
  applyRepeatAndAutoplay();
  if (autoplayEnabled.value) scheduleAutoplay();
  else cancelAutoplay();
}

function updatePictureInPictureState() {
  const video = videoRef.value;
  pictureInPictureActive.value = Boolean(
    video && (
      document.pictureInPictureElement === video ||
      video.webkitPresentationMode === 'picture-in-picture'
    )
  );
}

function attachPictureInPictureListeners(video) {
  if (!video) return;
  video.addEventListener('enterpictureinpicture', updatePictureInPictureState);
  video.addEventListener('leavepictureinpicture', updatePictureInPictureState);
  video.addEventListener('webkitpresentationmodechanged', updatePictureInPictureState);
}

function detachPictureInPictureListeners(video) {
  if (!video) return;
  video.removeEventListener('enterpictureinpicture', updatePictureInPictureState);
  video.removeEventListener('leavepictureinpicture', updatePictureInPictureState);
  video.removeEventListener('webkitpresentationmodechanged', updatePictureInPictureState);
}

async function togglePictureInPicture() {
  const video = videoRef.value;
  if (!video || !pictureInPictureSupported.value) return;

  try {
    if (
      document.pictureInPictureEnabled &&
      typeof video.requestPictureInPicture === 'function'
    ) {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
        await video.requestPictureInPicture();
      }
    } else if (typeof video.webkitSetPresentationMode === 'function') {
      const nextMode = video.webkitPresentationMode === 'picture-in-picture'
        ? 'inline'
        : 'picture-in-picture';
      video.webkitSetPresentationMode(nextMode);
    }
    updatePictureInPictureState();
  } catch (pipError) {
    console.warn('Picture-in-Picture failed:', pipError);
  }
}

const nativeHlsSupported = ref(false);
const hasM3u8 = ref(false);

onMounted(() => {
  // ブラウザがネイティブに m3u8 を扱えるか判定
  try {
    const tv = document.createElement('video');
    const can1 = tv.canPlayType && tv.canPlayType('application/vnd.apple.mpegurl');
    const can2 = tv.canPlayType && tv.canPlayType('application/x-mpegURL');
    nativeHlsSupported.value = !!(can1 || can2);
  } catch (e) {
    nativeHlsSupported.value = false;
  }

  if (videoRef.value) {
    videoRef.value.addEventListener('mousemove', showSettingsBox);
    videoRef.value.addEventListener('click', showSettingsBox);
    // ended リスナを初期化時に追加
    try {
      videoRef.value.addEventListener('ended', _onEnded);
      _onEndedAttached = true;
    } catch (e) {}
    // その他設定を反映
    applyRepeatAndAutoplay();
  }

  window.addEventListener('mousemove', showSettingsBox);
  window.addEventListener('click', showSettingsBox);
  window.addEventListener('touchstart', showSettingsBox, { passive: true });
  window.addEventListener('scroll', showSettingsBox);
  showSettingsBox();
  window.addEventListener(AUTOPLAY_SETTING_EVENT, handleAutoplaySettingChange);
  // attach loop timeupdate handler if video element exists
  try {
    if (videoRef.value) videoRef.value.addEventListener('timeupdate', onTimeUpdateLoopHandler);
  } catch (e) {}
});

onBeforeUnmount(() => {
  ++streamRequestSequence;
  subtitleSelection?.dispose();
  fullscreenController?.dispose();
  streamRequest.dispose();
  clearInitialPlaybackRecovery();
  clearM3u8LoadTimeout();
  clearPlaybackConfirmationTimer();
  clearType2LoadingReloadTimer();
  revokeSubtitleTracks(subtitleTracks.value);
  try { cancelAutoplay(); } catch (e) {}
  try { detachBufferListeners(); } catch (e) {}
  try { detachLoopBufferListeners(); } catch (e) {}
  try { detachPictureInPictureListeners(videoRef.value); } catch (e) {}
  try {
    window.removeEventListener('mousemove', showSettingsBox);
    window.removeEventListener('click', showSettingsBox);
    window.removeEventListener('touchstart', showSettingsBox);
    window.removeEventListener('scroll', showSettingsBox);
    window.removeEventListener(AUTOPLAY_SETTING_EVENT, handleAutoplaySettingChange);
  } catch (e) {}
  try {
    if (videoRef.value) videoRef.value.removeEventListener('timeupdate', onTimeUpdateLoopHandler);
  } catch (e) {}
});

// 再生時に m3u8 を使うべきか（Apple はそのまま、非 Apple は nativeHlsSupported を確認）
function isAppleDevice() {
  return isAppleDeviceCheck();
}
function useM3u8Playback() {
  try {
    if (m3u8PlaybackDisabled.value) return false;
    if (!hasM3u8.value) return false;
    return nativeHlsSupported.value === true;
  } catch (e) { return false; }
}

function clearM3u8LoadTimeout() {
  if (m3u8LoadTimer !== null) {
    window.clearTimeout(m3u8LoadTimer);
    m3u8LoadTimer = null;
  }
}

function isCurrentlyUsingM3u8() {
  if (m3u8PlaybackDisabled.value) return false;
  const sel = selectedQuality.value;
  const entry = sources.value[sel];
  if (!entry) return false;
  const candidateSources = entry.url || Array.isArray(entry.sources)
    ? getSingleStreamSources(entry)
    : getVideoSourcesForEntry(entry);
  return isM3u8PlaybackActive(videoRef.value, candidateSources);
}

function selectedQualityHasM3u8() {
  if (!useM3u8Playback()) return false;
  const entry = sources.value[selectedQuality.value];
  if (!entry) return false;
  const candidateSources = entry.url || Array.isArray(entry.sources)
    ? getSingleStreamSources(entry)
    : getVideoSourcesForEntry(entry);
  return candidateSources.some(isM3u8Source);
}

function startM3u8LoadTimeout() {
  if (m3u8LoadTimer !== null) return;
  if (!shouldMonitorM3u8Playback({
    attempted: m3u8PlaybackAttempted.value,
    disabled: m3u8PlaybackDisabled.value,
    active: isCurrentlyUsingM3u8(),
  })) return;

  m3u8LoadTimer = window.setTimeout(() => {
    handleM3u8LoadTimeout();
  }, M3U8_PLAYBACK_TIMEOUT_MS);
}

async function handleM3u8LoadTimeout() {
  m3u8LoadTimer = null;
  if (!m3u8PlaybackAttempted.value) return;
  // durationやcanplayでは判断しない。ライブを含め、playing発生だけを成功とする。
  if (playbackEstablished.value) return;
  if (recordSetupFailure()) return;
  if (m3u8PlaybackDisabled.value) return;

  console.warn("m3u8 playback did not start within 8s. Falling back to non-m3u8 sources.");
  m3u8PlaybackDisabled.value = true;

  let prevTime = 0;
  try {
    if (videoRef.value) prevTime = videoRef.value.currentTime || 0;
  } catch (e) {}

  // 非m3u8で再生可能な最適な画質を選択する（空URLの画質は除外される）
  const bestQuality = selectBestPlayableQuality(
    sources.value,
    availableQualities.value,
    selectedQuality.value,
    { useM3u8: false }
  );

  appleFallbackActive.value = false;
  appleSourceIndex.value = 0;
  playerReady.value = false;
  playerBuffering.value = false;

  if (bestQuality && bestQuality !== selectedQuality.value) {
    selectedQuality.value = bestQuality;
    return;
  }

  // 同じ画質内で非m3u8ソースに切り替える場合
  playerRenderKey.value += 1;
  await nextTick();
  const entry = sources.value[selectedQuality.value];
  if (videoRef.value && entry) {
    if (isSingleStreamEntry(entry)) {
      applyVideoSources(videoRef.value, getSingleStreamSources(entry));
    } else if (entry.video) {
      applyVideoSources(videoRef.value, getVideoSourcesForEntry(entry));
    }
    try {
      if (prevTime > 0) videoRef.value.currentTime = prevTime;
    } catch (e) {}
    if (autoplayEnabled.value) {
      videoRef.value.play().catch(() => {});
    }
  }
}

function isSingleStreamEntry(entry) {
  try {
    const list = getSingleStreamSources(entry);
    return Array.isArray(list) && list.length > 0;
  } catch (e) { return false; }
}

function getSingleStreamSources(entry) {
  const useM3u8 = useM3u8Playback();
  const candidateSources = getSingleStreamSourcesList(entry, {
    isApple: isAppleDevice(),
    fallbackActive: appleFallbackActive.value,
    sourceIndex: appleSourceIndex.value,
    useM3u8,
  });
  return selectNativeHlsSources(candidateSources, { useM3u8 });
}

function getCandidateSourcesForCurrentQuality() {
  const sel = selectedQuality.value;
  const entry = sources.value[sel];
  if (!entry) return [];
  if (isSingleStreamEntry(entry)) {
    return getSingleStreamSourcesList(entry, {
      isApple: false,
      fallbackActive: false,
      useM3u8: useM3u8Playback(),
    });
  } else if (entry.video) {
    return getVideoSourcesForEntryList(entry, {
      isApple: false,
      fallbackActive: false,
    });
  }
  return [];
}

function tryNextAppleSource() {
  if (!isAppleDevice()) return false;
  const candidateSources = getCandidateSourcesForCurrentQuality();
  if (!candidateSources || candidateSources.length <= 1) {
    return false;
  }

  const now = Date.now();
  if (now - lastAppleFallbackAttemptTime < 150) {
    return true;
  }
  lastAppleFallbackAttemptTime = now;

  if (!appleFallbackActive.value) {
    appleFallbackActive.value = true;
    appleSourceIndex.value = 1 < candidateSources.length ? 1 : 0;
  } else {
    appleSourceIndex.value += 1;
  }

  if (appleSourceIndex.value < candidateSources.length) {
    const entry = sources.value[selectedQuality.value];
    if (entry?.video) {
      entry.video._appleFallbackActive = true;
      entry.video._appleSourceIndex = appleSourceIndex.value;
    }
    playerReady.value = false;
    playerBuffering.value = false;
    playerRenderKey.value += 1;
    scheduleInitialPlaybackRecovery();

    const currentSource = candidateSources[appleSourceIndex.value];
    nextTick(() => {
      if (!videoRef.value || !currentSource) return;
      applyVideoSources(videoRef.value, [currentSource]);
      if (autoplayEnabled.value) {
        try {
          videoRef.value.play().catch(() => {});
        } catch (e) {}
      }
    });
    return true;
  }

  return false;
}

function handleVideoError(event) {
  if (event?.currentTarget && event.currentTarget !== videoRef.value) return;
  if (isCurrentlyUsingM3u8()) {
    // source設定直後のmedia errorではHLSを無効化せず、専用タイムアウトまで待つ。
    startM3u8LoadTimeout();
    return;
  }
  if (isAppleDevice()) {
    const handled = tryNextAppleSource();
    if (handled) return;
  }
  if (recordSetupFailure()) return;
  scheduleInitialPlaybackRecovery();
}

function handleSourceError(event) {
  const sourceElement = event?.currentTarget;
  if (sourceElement?.parentElement && sourceElement.parentElement !== videoRef.value) {
    return;
  }
  // source要素1件のエラーだけではmedia要素全体の失敗ではない。
  // ブラウザの候補選択とHLS専用タイムアウトを待つ。
  if (isM3u8Source({
    url: sourceElement?.src,
    mimeType: sourceElement?.type,
  })) {
    return;
  }
  scheduleInitialPlaybackRecovery();
}

function recordSetupFailure() {
  if (playbackEstablished.value || muxedFallbackAttempted) return false;
  setupFailureCount += 1;
  if (setupFailureCount === 2) {
    return tryMuxedThirdSetup();
  }
  return false;
}

function tryMuxedThirdSetup() {
  const fallbackSources = muxedFallbackSources.value.filter((source) => source?.url);
  if (fallbackSources.length === 0 || muxedFallbackAttempted) return false;

  muxedFallbackAttempted = true;
  const fallbackQuality = "__muxed_fallback";
  sources.value[fallbackQuality] = {
    url: fallbackSources[0].url,
    mimeType: fallbackSources[0].mimeType,
    isM3u8: fallbackSources[0].isM3u8,
    sources: fallbackSources,
  };
  if (!availableQualities.value.includes(fallbackQuality)) {
    availableQualities.value = [...availableQualities.value, fallbackQuality];
  }
  qualityLabels.value[fallbackQuality] = "再試行 (muxed)";
  playerRenderKey.value += 1;
  muxedFallbackSelectionPending = true;
  selectedQuality.value = fallbackQuality;
  return true;
}

function applyVideoSources(videoEl, sourcesList) {
  if (!videoEl) return;
  try {
    videoEl.querySelectorAll(":scope > source").forEach((source) => source.remove());
    const progressiveSources = sourcesList.filter((source) => !source?.isM3u8);
    const nativeHls = !m3u8PlaybackDisabled.value && (
      videoEl.canPlayType("application/vnd.apple.mpegurl") ||
      videoEl.canPlayType("application/x-mpegURL")
    );
    const playableSources = (nativeHls && !m3u8PlaybackDisabled.value) || progressiveSources.length === 0
      ? sourcesList
      : progressiveSources;
    for (const s of playableSources) {
      if (!s?.url) continue;
      if (m3u8PlaybackDisabled.value && s.isM3u8) continue;
      const sourceEl = document.createElement("source");
      sourceEl.src = s.url;
      const sourceType = getMediaSourceMimeType(s);
      if (sourceType) sourceEl.type = sourceType;
      sourceEl.addEventListener("error", handleSourceError);
      videoEl.appendChild(sourceEl);
    }
    videoEl.load();
  } catch (e) {}
}

function applySubtitleTracks(videoEl, tracks) {
  subtitleSelection?.dispose();
  subtitleSelection = null;
  if (!videoEl) return;
  try {
    videoEl.querySelectorAll(":scope > track[data-type2-subtitle]").forEach((track) => track.remove());
    for (const [index, track] of (Array.isArray(tracks) ? tracks : []).entries()) {
      if (!track?.src) continue;
      const trackEl = document.createElement("track");
      trackEl.dataset.type2Subtitle = String(index);
      trackEl.src = track.src;
      trackEl.srclang = track.srclang || "ja";
      trackEl.label = track.label || trackEl.srclang;
      trackEl.kind = track.kind || "subtitles";
      trackEl.default = false;
      videoEl.appendChild(trackEl);
      trackEl.track.mode = "disabled";
    }
    subtitleSelection = bindSubtitleSelection(videoEl, () => {
      if (selectedSubtitle.value === "") return null;
      return Array.from(videoEl.querySelectorAll(":scope > track[data-type2-subtitle]"))
        .find((track) => track.dataset.type2Subtitle === selectedSubtitle.value)?.track;
    });
  } catch (e) {}
}

function isAudioOnlyEntry(entry) {
  try {
    return !!(entry && entry.audio && !entry.video && !entry.url);
  } catch (e) { return false; }
}

function getVideoSourcesForEntry(entry) {
  const candidateSources = getVideoSourcesForEntryList(entry, {
    isApple: isAppleDevice(),
    fallbackActive: appleFallbackActive.value,
    sourceIndex: appleSourceIndex.value,
  });
  return selectNativeHlsSources(candidateSources, {
    useM3u8: useM3u8Playback(),
  });
}

const {
  attachBufferListeners,
  cancelAutoplay,
  detachBufferListeners,
  detachLoopBufferListeners,
  handleUnmuteClick,
  onFirstUserGesture,
  onTimeUpdateLoopHandler,
  scheduleAutoplay,
  showSettingsBox,
} = createPlaybackController({
  videoRef,
  audioRef,
  settingsVisible,
  showUnmutePrompt,
  autoplayEnabled,
  repeatEnabled,
  isCurrentlyUsingM3u8,
  startM3u8LoadTimeout,
  clearM3u8LoadTimeout,
});

// 繰り返し再生が選ばれた時
watch(repeatEnabled, (newVal) => {
  try {
    if (newVal) {
      // if repeat turned on, disable autoplay and clear any scheduled autoplay
      autoplayEnabled.value = false;
      try { cancelAutoplay(); } catch (e) {}
    } else {
      // if repeat turned off, leave autoplay as user-configured; do not force change
      // if sources ready, schedule autoplay
      try {
        if (autoplayEnabled.value) scheduleAutoplay();
      } catch (e) {}
    }
  } catch (e) {}
});

// persist autoplay setting across videos
watch(autoplayEnabled, (val) => {
  try { saveAutoplay(!!val); } catch (e) {}
});

function reloadSrc() {
  const sel = selectedQuality.value;
  const entry = sources.value[sel];
  if (!entry) return;

  if (isSingleStreamEntry(entry)) {
    // single-stream
    if (videoRef.value) {
      applyVideoSources(videoRef.value, getSingleStreamSources(entry));
    }
    if (audioRef.value) {
      const aSource = audioRef.value.querySelector('source');
      if (aSource) aSource.removeAttribute('src');
      audioRef.value.removeAttribute('src');
      audioRef.value.load();
    }
  } else if (isAudioOnlyEntry(entry)) {
    if (audioRef.value && entry.audio.url) {
      const source = audioRef.value.querySelector('source');
      if (source) {
        source.src = entry.audio.url;
        if (entry.audio.mimeType) source.type = entry.audio.mimeType;
      } else {
        audioRef.value.src = entry.audio.url;
      }
      audioRef.value.load();
    }
  } else if (entry.video) {
    // video+audio
    if (videoRef.value) {
      applyVideoSources(videoRef.value, getVideoSourcesForEntry(entry));
    }
    if (audioRef.value && entry.audio.url) {
      const source = audioRef.value.querySelector('source');
      if (source) source.src = entry.audio.url;
      audioRef.value.load();
    }
  }
}

function checkPlayback() {
  if (videoRef.value) {
    videoRef.value.play().catch(() => {
      if (recordSetupFailure()) return;
      if (isAppleDevice() && tryNextAppleSource()) {
        return;
      }
      reloadSrc();
    });
  }
  if (audioRef.value) {
    audioRef.value.play().catch(() => {
      if (recordSetupFailure()) return;
      reloadSrc();
    });
  }
}

function capturePlaybackSelection() {
  const sequence = streamRequestSequence;
  const quality = selectedQuality.value;
  const renderKey = playerRenderKey.value;
  return () => sequence === streamRequestSequence &&
    quality === selectedQuality.value && renderKey === playerRenderKey.value;
}

// single-stream 切替時の共通セットアップ（再生位置を維持）
function applyHlsSetup(prevTime = 0) {
  const isCurrentSelection = capturePlaybackSelection();
  isQualitySwitching.value = true;
  setTimeout(() => { if (isCurrentSelection()) isQualitySwitching.value = false; }, 1000);

  // pause before src swap (テンプレート側で :key により再レンダリングされる)
  try { if (videoRef.value) { prevTime = videoRef.value.currentTime || prevTime; videoRef.value.pause(); } } catch (e) {}
  try {
    if (audioRef.value) {
      audioRef.value.pause();
      const aSource = audioRef.value.querySelector('source');
      if (aSource) aSource.removeAttribute('src');
      audioRef.value.removeAttribute('src');
      audioRef.value.load();
    }
  } catch (e) {}

  nextTick(() => {
    if (!isCurrentSelection()) return;
    const entry = sources.value[selectedQuality.value];
    if (videoRef.value && isSingleStreamEntry(entry)) {
      applyVideoSources(videoRef.value, getSingleStreamSources(entry));
      markPlayerReady();
    }
    // 再レンダリング後に時間を復元して再生を試みる
    try {
      if (videoRef.value) {
        // HLS は currentTime 設定が成功しないこともあるため複数回試す
        videoRef.value.currentTime = prevTime;
        setTimeout(() => { if (!isCurrentSelection()) return; try { if (videoRef.value) videoRef.value.currentTime = prevTime; } catch (e) {} }, 250);
      }
    } catch (e) {}

    // ended リスナを再attach
    if (videoRef.value) {
      try {
        videoRef.value.removeEventListener('ended', _onEnded);
        videoRef.value.addEventListener('ended', _onEnded);
        _onEndedAttached = true;
      } catch (e) {}
    }

    const granted2 = (() => { try { return localStorage.getItem(USER_GESTURE_KEY) === '1'; } catch (e) { return false; } })();

    try {
      if (videoRef.value) {
        videoRef.value.muted = !granted2;
        if (autoplayEnabled.value) scheduleAutoplay();
      }
      if (audioRef.value) {
        audioRef.value.muted = !granted2;
        if (autoplayEnabled.value) scheduleAutoplay();
      }
      attachBufferListeners();
      showUnmutePrompt.value = !granted2;
      if (!granted2) {
        window.addEventListener('click', onFirstUserGesture, { once: true });
        window.addEventListener('touchstart', onFirstUserGesture, { once: true });
      } else {
        scheduleAutoplay();
      }
    } catch (e) {}
    // Add playback check for HLS
    if (videoRef.value) {
      videoRef.value.addEventListener('canplay', checkPlayback, { once: true });
    }
  });
}

// selectedQuality の監視: 選択先が HLS(url) を持つかどうかで挙動を分ける
watch(selectedQuality, (newQuality) => {
  const isCurrentSelection = capturePlaybackSelection();
  clearPlaybackConfirmationTimer();
  m3u8PlaybackAttempted.value = false;
  playbackEstablished.value = false;
  const isMuxedFallbackSelection = muxedFallbackSelectionPending;
  muxedFallbackSelectionPending = false;
  if (!isMuxedFallbackSelection) {
    setupFailureCount = 0;
    muxedFallbackAttempted = false;
  }
  playerReady.value = false;
  playerBuffering.value = false;
  appleFallbackActive.value = false;
  appleSourceIndex.value = 0;
  clearM3u8LoadTimeout();
  if (
    initialPlaybackRecovery &&
    !initialPlaybackRecoveryRunning &&
    newQuality &&
    newQuality !== initialPlaybackRecovery.quality
  ) {
    clearInitialPlaybackRecovery();
  }
  const sel = selectedQuality.value;
  const entry = sources.value[sel];

  if (!entry) return;

  // If entry has single-stream URL and device can use it
  if (isSingleStreamEntry(entry)) {
    // preserve position and apply HLS setup
    let prevTime = 0;
    try { if (videoRef.value) prevTime = videoRef.value.currentTime || 0; } catch (e) {}
    applyHlsSetup(prevTime);
    return;
  }

  // Audio-only
  if (isAudioOnlyEntry(entry)) {
    isQualitySwitching.value = true;
    setTimeout(() => { if (isCurrentSelection()) isQualitySwitching.value = false; }, 1000);
    nextTick(() => {
      if (!isCurrentSelection()) return;
      try {
        if (audioRef.value && entry.audio?.url) {
          const source = audioRef.value.querySelector('source');
          if (source) {
            source.src = entry.audio.url;
            if (entry.audio.mimeType) source.type = entry.audio.mimeType;
          } else {
            audioRef.value.src = entry.audio.url;
          }
          audioRef.value.load();
          markPlayerReady();
        }
      } catch (e) {}
      applyRepeatAndAutoplay();
      const granted2 = (() => { try { return localStorage.getItem(USER_GESTURE_KEY) === '1'; } catch (e) { return false; } })();
      try {
        if (audioRef.value) {
          audioRef.value.muted = !granted2;
          if (autoplayEnabled.value) scheduleAutoplay();
        }
        attachBufferListeners();
        showUnmutePrompt.value = !granted2;
        if (!granted2) {
          window.addEventListener('click', onFirstUserGesture, { once: true });
          window.addEventListener('touchstart', onFirstUserGesture, { once: true });
        } else {
          scheduleAutoplay();
        }
      } catch (e) {}
      if (audioRef.value) {
        audioRef.value.addEventListener('canplay', checkPlayback, { once: true });
      }
    });
    return;
  }

  // Otherwise use legacy video+audio sync flow (entry.video must exist)
  if (entry.video) {
    // Force element re-create for separated AV (Safari/iOS cache issues)
    separateAvKey.value += 1;
    isQualitySwitching.value = true;
    setTimeout(() => {
      if (!isCurrentSelection()) return;
      isQualitySwitching.value = false;
    }, 4000);
    let prevTime = 0;
    if (videoRef.value) {
      prevTime = videoRef.value.currentTime;
      videoRef.value.pause();
    }
    if (audioRef.value) {
      audioRef.value.pause();
    }
    nextTick(() => {
      if (!isCurrentSelection()) return;
      setupSyncPlayback(
        videoRef.value,
        audioRef.value,
        sources,
        selectedQuality,
        diffText,
        selectedPlaybackRate
      );
      if (videoRef.value || audioRef.value) markPlayerReady();
      applyRepeatAndAutoplay();
      
      // ended リスナを再attach
      if (videoRef.value) {
        try {
          videoRef.value.removeEventListener('ended', _onEnded);
          videoRef.value.addEventListener('ended', _onEnded);
          _onEndedAttached = true;
        } catch (e) {}
      }
      
      const granted2 = (() => { try { return localStorage.getItem(USER_GESTURE_KEY) === '1'; } catch (e) { return false; } })();
      try {
        if (videoRef.value) {
          videoRef.value.muted = !granted2;
          if (autoplayEnabled.value) scheduleAutoplay();
        }
        if (audioRef.value) {
          audioRef.value.muted = !granted2;
          if (autoplayEnabled.value) scheduleAutoplay();
        }
        attachBufferListeners();
        showUnmutePrompt.value = !granted2;
        if (!granted2) {
          window.addEventListener('click', onFirstUserGesture, { once: true });
          window.addEventListener('touchstart', onFirstUserGesture, { once: true });
        } else {
          scheduleAutoplay();
        }
      } catch (e) {}
      // Add playback check for video+audio
      if (videoRef.value) {
        videoRef.value.addEventListener('canplay', checkPlayback, { once: true });
      }
      if (audioRef.value) {
        audioRef.value.addEventListener('canplay', checkPlayback, { once: true });
      }
      setTimeout(() => {
        if (!isCurrentSelection()) return;
        try {
          if (videoRef.value) videoRef.value.currentTime = prevTime;
          if (audioRef.value) audioRef.value.currentTime = prevTime;
        } catch (e) {}
        setTimeout(() => {
          if (!isCurrentSelection()) return;
          try {
            if (videoRef.value) videoRef.value.currentTime = prevTime;
            if (audioRef.value) audioRef.value.currentTime = prevTime;
          } catch (e) {}
        }, 600);
      }, 600);
    });
  }
});

function applyRepeatAndAutoplay() {
  if (videoRef.value) {
    videoRef.value.loop = !!repeatEnabled.value;
    videoRef.value.autoplay = !!autoplayEnabled.value;
    videoRef.value.playbackRate = selectedPlaybackRate.value;
  }
  if (audioRef.value) {
    audioRef.value.loop = !!repeatEnabled.value;
    audioRef.value.autoplay = !!autoplayEnabled.value;
    audioRef.value.playbackRate = selectedPlaybackRate.value;
  }
}

function resetStreamPlayback() {
  ++streamRequestSequence;
  clearType2LoadingReloadTimer();
  cancelAutoplay();
  detachBufferListeners();
  detachLoopBufferListeners();
  isQualitySwitching.value = false;
  clearInitialPlaybackRecovery();
  clearM3u8LoadTimeout();
  clearPlaybackConfirmationTimer();
  m3u8PlaybackDisabled.value = false;
  m3u8PlaybackAttempted.value = false;
  appleFallbackActive.value = false;
  appleSourceIndex.value = 0;
  error.value = "";
  errorCode.value = "";
  errorExpiresAt.value = 0;
  sources.value = {};
  selectedQuality.value = "";
  selectedPlaybackRate.value = 1.0;
  diffText.value = "0";
  availableQualities.value = [];
  playerReady.value = false;
  playerBuffering.value = false;
  playbackEstablished.value = false;
  setupFailureCount = 0;
  muxedFallbackAttempted = false;
  muxedFallbackSelectionPending = false;
  muxedFallbackSources.value = [];
  hasM3u8.value = false;
  revokeSubtitleTracks(subtitleTracks.value);
  subtitleTracks.value = [];
  selectedSubtitle.value = "";
  subtitleSelection?.sync();
}

async function applyStreamResponse(data, { id, isCurrent }) {
  const sequence = streamRequestSequence;
  const locale = typeof navigator !== "undefined" ? navigator.language : "ja";
  const normalizedFormats = normalizeStreamFormats(data, locale);
  const parsed = parseStream2Response(
    { formats: normalizedFormats },
    {
      allowM3u8: nativeHlsSupported.value,
    },
  );
  const rawSubtitleTracks = selectPlaybackSubtitleTracks(
    extractSubtitleTracks(data, locale)
  );
  localizeSubtitleTracks(rawSubtitleTracks).then((localizedTracks) => {
    if (sequence !== streamRequestSequence || id !== props.videoId) {
      revokeSubtitleTracks(localizedTracks);
      return;
    }
    revokeSubtitleTracks(subtitleTracks.value);
    subtitleTracks.value = localizedTracks;
    applySubtitleTracks(videoRef.value, localizedTracks);
  }).catch(() => { /* 字幕の失敗は動画の描画を妨げない */ });
  if (!parsed || Object.keys(parsed.sources || {}).length === 0) {
    throw new Error("利用可能なストリームがありません。");
  }

  sources.value = parsed.sources;
  qualityLabels.value = parsed.qualityLabels || {};
  availableQualities.value = parsed.availableQualities || [];
  muxedFallbackSources.value = Array.isArray(parsed.muxedFallbackSources)
    ? parsed.muxedFallbackSources
    : [];
  hasM3u8.value = !!parsed.hasM3u8;
  const preferred = (() => {
    try { return loadPreferredQuality(); } catch (e) { return "auto"; }
  })();
  const initialQuality = selectBestPlayableQuality(
    sources.value,
    availableQualities.value,
    preferred,
    { useM3u8: useM3u8Playback() }
  );
  const resolvedInitialQuality = initialQuality || parsed.defaultQuality || availableQualities.value[0] || "";
  if (!resolvedInitialQuality || !sources.value[resolvedInitialQuality]) {
    throw new Error("利用可能なストリームがありません。");
  }
  // Commit the render key together with the sources, before the quality watcher runs.
  playerRenderKey.value += 1;
  selectedQuality.value = resolvedInitialQuality;
  await nextTick();
  if (!isCurrent()) return;
  beginInitialPlaybackRecovery(sequence, id, selectedQuality.value);

  // 自動再生が有効なら候補IDだけ確認する（プリフェッチは行わない）
  try {
    if (autoplayEnabled.value) {
      // noop: 候補は ended 時にその場で選ぶ
      getAutoplayCandidateId();
    }
  } catch (e) {}
}

function handleStreamRequestError(err) {
  if (isVideoStreamError(err)) {
    errorCode.value = err.code || "";
    const expiresAt = Date.parse(err.payload?.expiresAt || "");
    errorExpiresAt.value = Number.isFinite(expiresAt) ? expiresAt : 0;
    error.value = err.payload?.message || err.message;
  } else if (err?.connectionFailure) {
    error.value = err.message;
  } else if (err && err.name === 'AbortError') {
    error.value = "ストリームURLの取得に失敗しました (タイムアウト)";
  } else {
    error.value = err?.message || "ストリームURLの取得に失敗しました (fetch error)";
  }
  sources.value = {};
  availableQualities.value = [];
  selectedQuality.value = "";
}

const streamRequest = createType2StreamRequest({
  fetchStream,
  onState: (state) => { requestState.value = state; },
  onStart: resetStreamPlayback,
  onResponse: applyStreamResponse,
  onError: handleStreamRequestError,
});

function fetchStreamUrl(id, forceRefresh = false) {
  return streamRequest.load(id, forceRefresh);
}

function markPlayerReady(event) {
  playerReady.value = true;
  playerBuffering.value = false;
  if (
    event?.currentTarget &&
    isPrimaryMediaElement(event.currentTarget) &&
    hasPlayableDuration(event.currentTarget)
  ) {
    clearInitialPlaybackRecovery();
  }
}

function markPlayerPlaying(event) {
  updateMetadata();
  m3u8PlaybackAttempted.value = true;
  playerReady.value = true;
  playerBuffering.value = false;
  playbackEstablished.value = true;
  setupFailureCount = 0;
  clearType2LoadingReloadTimer();
  clearM3u8LoadTimeout();
  clearPlaybackConfirmationTimer();
  const mediaEl = event?.currentTarget;
  if (mediaEl) {
    playbackConfirmationTimer = window.setTimeout(() => {
      playbackConfirmationTimer = null;
      if (mediaEl === videoRef.value || mediaEl === audioRef.value) {
        playbackEstablished.value = true;
      }
    }, 500);
  }
  if (event?.currentTarget && isPrimaryMediaElement(event.currentTarget)) {
    clearInitialPlaybackRecovery();
  }
}

function handlePlaybackAttempt(event) {
  if (event?.currentTarget && event.currentTarget !== videoRef.value) return;
  if (!isCurrentlyUsingM3u8()) return;
  m3u8PlaybackAttempted.value = true;
  startM3u8LoadTimeout();
}

function markPlayerBuffering() {
  if (playerReady.value) playerBuffering.value = true;
  if (isCurrentlyUsingM3u8()) {
    m3u8PlaybackAttempted.value = true;
    startM3u8LoadTimeout();
  }
}

watch(
  type2LoadingOverlayVisible,
  (visible) => {
    if (visible) {
      scheduleType2LoadingReload(streamRequestSequence);
    } else {
      clearType2LoadingReloadTimer();
    }
  },
  { immediate: true }
);

watch(
  () => props.videoId,
  (newId) => {
    if (newId) {
      fetchStreamUrl(newId);
    } else {
      streamRequest.cancel();
      resetStreamPlayback();
    }
  },
  { immediate: true }
);

watch(selectedPlaybackRate, () => {
  if (videoRef.value) videoRef.value.playbackRate = selectedPlaybackRate.value;
  if (audioRef.value) audioRef.value.playbackRate = selectedPlaybackRate.value;
});

watch(selectedSubtitle, () => subtitleSelection?.sync(), { flush: "sync" });

// videoRef の変化を監視して ended リスナの attach/detach を行う
watch(videoRef, (newEl, oldEl) => {
  fullscreenController?.dispose();
  fullscreenController = newEl ? createVideoFullscreen(newEl) : null;
  fullscreenSupported.value = fullscreenController?.supported ?? false;
  fullscreenError.value = '';
  subtitleSelection?.dispose();
  subtitleSelection = null;
  detachPictureInPictureListeners(oldEl);
  if (oldEl && _onEndedAttached) {
    try { oldEl.removeEventListener('ended', _onEnded); } catch (e) {}
    _onEndedAttached = false;
  }
  if (newEl) {
    try {
      attachPictureInPictureListeners(newEl);
      updatePictureInPictureState();
      // リスナ追加前に既存のものがあれば削除
      newEl.removeEventListener('ended', _onEnded);
      newEl.addEventListener('ended', _onEnded);
      _onEndedAttached = true;
      applySubtitleTracks(newEl, subtitleTracks.value);
    } catch (e) {}
  }
  if (!newEl) pictureInPictureActive.value = false;
}, { flush: 'post' });

</script>

<style scoped src="../styles/stream-type-2.css"></style>
