<template>
  <div class="settings-wrapper" v-if="modalIsOpen">
    <div class="settings-modal-overlay" @click.self="closeSettings"></div>
    <div class="settings-modal" @click.stop>
      <!-- ヘッダー -->
      <div class="settings-modal-header">
        <h2>設定</h2>
        <button
          type="button"
          class="close-button"
          @click="closeSettings"
          aria-label="設定を閉じる"
        >
          ✕
        </button>
      </div>

      <!-- コンテンツ -->

      <div class="settings-modal-content">


        <!-- リクエストプロキシ -->
        <section class="settings-section">
          <h3>リクエストプロキシ</h3>
          <label :for="requestProxyInputId" class="proxy-url-label">
            プロキシURL:
            <input
              :id="requestProxyInputId"
              type="url"
              class="proxy-url-input"
              :value="requestProxyUrl"
              placeholder="https://proxy.example.com/"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="requestProxyUrlError ? 'true' : 'false'"
              :aria-describedby="requestProxyUrlError
                ? `${requestProxyHelpId} ${requestProxyErrorId}`
                : requestProxyHelpId"
              @input="handleRequestProxyUrlChange($event.target.value)"
              @change="handleRequestProxyUrlCommit($event.target.value)"
              @keydown.enter="$event.target.blur()"
            />
          </label>
          <small :id="requestProxyHelpId" class="proxy-url-help">
            API通信がプロキシ経由になります。<br>空欄の場合はプロキシされません。
          </small>
          <div v-if="!requestProxyUrl.trim()" class="proxy-creation-help">
            <p>プロキシが設定されていません。</p>
            <button
              type="button"
              class="proxy-creation-toggle"
              :aria-expanded="showProxyCreationGuide ? 'true' : 'false'"
              :aria-controls="proxyCreationGuideId"
              @click="showProxyCreationGuide = true"
            >
              作り方を表示
            </button>
          </div>
          <small
            v-if="requestProxyUrlError"
            :id="requestProxyErrorId"
            class="setting-error"
            role="alert"
          >
            {{ requestProxyUrlError }}
          </small>
          <button
            type="button"
            class="proxy-jsonp-toggle"
            :class="{ 'is-active': requestProxyJsonpEnabled }"
            :aria-pressed="requestProxyJsonpEnabled ? 'true' : 'false'"
            aria-label="JSONPを有効にする"
            @click="handleRequestProxyJsonpToggle"
          >
            <span class="proxy-jsonp-indicator" aria-hidden="true">
              {{ requestProxyJsonpEnabled ? "✓" : "" }}
            </span>
            <span>JSONPを有効にする</span>
          </button>
          <small v-if="requestProxyJsonpEnabled" class="proxy-jsonp-help">
            JSONPが必要な場合に使用します。信頼できるプロキシのみ設定してください。
          </small>
          <div
            v-if="requestProxyCheckStatus === 'checking'"
            class="proxy-check-status proxy-check-status-checking"
            role="status"
            aria-live="polite"
          >
            <span class="proxy-check-spinner" aria-hidden="true"></span>
            <span>{{ requestProxyJsonpEnabled
              ? "JSONPプロキシを確認しています…"
              : "プロキシを確認しています…" }}</span>
          </div>
          <div
            v-else-if="requestProxyCheckStatus === 'success'"
            class="proxy-check-status proxy-check-status-success"
            role="status"
            aria-live="polite"
            tabindex="0"
            :aria-describedby="requestProxyStatusTooltipId"
          >
            <span class="proxy-check-icon" aria-hidden="true">✔</span>
            <strong>プロキシが有効です</strong>
            <span class="proxy-check-info" aria-hidden="true">ⓘ</span>
            <span
              :id="requestProxyStatusTooltipId"
              class="proxy-check-tooltip"
              role="tooltip"
            >
              {{ requestProxySuccessDescription }}
            </span>
          </div>
          <div
            v-else-if="requestProxyCheckStatus === 'error'"
            class="proxy-check-status proxy-check-status-error"
            role="status"
            aria-live="polite"
          >
            <span class="proxy-check-icon" aria-hidden="true">!</span>
            <span>{{ requestProxyJsonpEnabled
              ? "JSONPプロキシを確認できませんでした"
              : "プロキシを確認できませんでした" }}</span>
            <button
              type="button"
              class="proxy-check-retry"
              @click="handleRequestProxyRetry"
            >
              再確認
            </button>
          </div>
        </section>

        <!-- デフォルト再生方式 -->
        <section class="settings-section">
          <h3>デフォルト再生方式</h3>
          <label
            ><input
              type="radio"
              :checked="defaultPlaybackMode === '1'"
              @change="handlePlaybackModeChange('1')"
            />
            通常</label
          >
          <label
            ><input
              type="radio"
              :checked="defaultPlaybackMode === '2'"
              @change="handlePlaybackModeChange('2')"
            />
            タイプ２(ストリームurl)</label
          >
        </section>

        <!-- 優先画質 -->
        <section class="settings-section">
          <h3>タイプ２優先画質</h3>
          <label>
            画質:
            <select
              class="selector"
              :value="preferredQuality"
              @change="handlePreferredQualityChange($event.target.value)"
            >
              <option v-for="q in preferredQualityOptions" :key="q" :value="q">
                {{ preferredQualityLabels[q] || q }}
              </option>
            </select>
          </label>
          <small>自動、または指定解像度がない場合は自動選択になります</small>
        </section>

        <!-- 自動再生設定 -->
        <section class="settings-section">
          <h3>自動再生</h3>
          <div class="autoplay-setting-group">
            <h4>自動再生モード</h4>
            <label>
              <input
                type="checkbox"
                :checked="autoplayEnabled"
                @change="handleAutoplayChange($event.target.checked)"
              />
              自動再生を有効にする
            </label>
            <small>動画の再生開始と、終了後の次の動画への移動を自動化します</small>
          </div>

          <div class="autoplay-setting-group">
            <h4>自動再生フィルタ</h4>
            <label>
              <input
                type="checkbox"
                :checked="shortVideoFilterEnabled"
                @change="handleFilterEnabledChange($event.target.checked)"
              />
              指定時間以下の動画のみ自動再生
            </label>
            <div v-if="shortVideoFilterEnabled" class="filter-time">
              <label>
                制限時間（分）:
                <input
                  type="number"
                  :value="shortVideoFilterMinutes"
                  @change="handleFilterMinutesChange(+$event.target.value)"
                  min="1"
                  max="120"
                  step="1"
                /> </label
              ><br />
              <small
                >{{
                  shortVideoFilterMinutes
                }}分以下の動画のみが自動再生対象になります</small
              >
            </div>
          </div>
        </section>

        <!-- 表示設定（デバイスに合わせる / ライト / ダーク） -->
        <section class="settings-section">
          <h3>表示設定</h3>
          <label
            ><input
              type="radio"
              :checked="displayMode === 'device'"
              @change="handleDisplayModeChange('device')"
            />
            デバイスに合わせる</label
          >
          <label
            ><input
              type="radio"
              :checked="displayMode === 'light'"
              @change="handleDisplayModeChange('light')"
            />
            ライトモード</label
          >
          <label
            ><input
              type="radio"
              :checked="displayMode === 'dark'"
              @change="handleDisplayModeChange('dark')"
            />
            ダークモード</label
          >
        </section>

        <!-- その他 -->
        <section class="settings-section">
          <h3>その他</h3>
          <label>
            <input
              type="checkbox"
              :checked="disableTimeouts"
              @change="handleDisableTimeoutsChange($event.target.checked)"
            />
            タイムアウトを無効化
          </label>
        </section>
      </div>

      <!-- フッター -->
      <div class="settings-modal-footer">
        <!--
        <button type="button" class="cancel-button" @click="closeSettings">キャンセル</button>
        -->
      </div>
    </div>

    <div
      v-if="showProxyCreationGuide"
      class="proxy-guide-overlay"
      @click.self="showProxyCreationGuide = false"
    >
      <section
        :id="proxyCreationGuideId"
        class="proxy-guide-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proxyCreationGuideTitleId"
      >
        <header class="proxy-guide-header">
          <h2 :id="proxyCreationGuideTitleId">プロキシの作り方</h2>
          <button
            type="button"
            class="close-button"
            aria-label="プロキシの作り方を閉じる"
            @click="showProxyCreationGuide = false"
          >
            ✕
          </button>
        </header>
        <div class="proxy-creation-guide">
          <p>
            <strong>通常版</strong>
            <a
              href="https://script.google.com/home/projects/1ZEA1vMWKdMurwIpTyW_aXuQoTgIwh4muZgtOxukwecVYwERnuBSQC2bo"
              target="_blank"
              rel="noopener noreferrer"
            >Google Apps Scriptを開く</a>
          </p>
          <p>
            <strong>タイプ2</strong>
            <a
              href="https://script.google.com/home/projects/1cdOvNbSQBUClgEeBAs8Ver0cbd8OjA-Ps7Fjocjtm98tk9Y7t0g8RHHs"
              target="_blank"
              rel="noopener noreferrer"
            >Google Apps Scriptを開く</a>
          </p>
          <iframe
            class="proxy-creation-preview"
            src="https://drive.google.com/file/d/1us8c3eK_IMgkDdY1dTfXfevhzykMECfd/preview"
            title="タイプ2プロキシの作り方"
            loading="lazy"
            allow="autoplay"
          ></iframe>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import {
  ref,
  onMounted,
  onBeforeUnmount,
  inject,
  watch,
  computed,
  useId,
} from "vue";
import {
  loadDefaultPlayback,
  saveDefaultPlayback,
  loadAutoplay,
  saveAutoplay,
  loadShortVideoFilter,
  saveShortVideoFilter,
  loadDisplayMode,
  saveDisplayMode,
  computeIsDarkFromMode,
  loadDisableTimeouts,
  saveDisableTimeouts,
  loadPreferredQuality,
  savePreferredQuality,
} from "@/utils/settingsManager";
import {
  ensureRequestProxyHealth,
  loadRequestProxy,
  loadRequestProxyHealth,
  loadRequestProxyJsonp,
  normalizeRequestProxyUrl,
  REQUEST_PROXY_CONFIG_EVENT,
  REQUEST_PROXY_HEALTH_EVENT,
  requestProxyTransport,
  saveRequestProxy,
  saveRequestProxyJsonp,
} from "@/utils/requestProxy";

// 設定モーダルの状態
const settingsModal = inject("settingsModal", {});
const settingsViewId = useId();
const requestProxyInputId = `${settingsViewId}-request-proxy-url`;
const requestProxyHelpId = `${settingsViewId}-request-proxy-help`;
const requestProxyErrorId = `${settingsViewId}-request-proxy-error`;
const requestProxyStatusTooltipId = `${settingsViewId}-request-proxy-status-tooltip`;
const proxyCreationGuideId = `${settingsViewId}-proxy-creation-guide`;
const proxyCreationGuideTitleId = `${settingsViewId}-proxy-creation-guide-title`;
const requestProxySuccessDescription =
  "プロキシを経由して、正しくしあtubeサーバーに接続ができ有効なレスポンスが返って来ました来ました";

// Settings state
const defaultPlaybackMode = ref("1");
const autoplayEnabled = ref(true);
const shortVideoFilterEnabled = ref(false);
const shortVideoFilterMinutes = ref(4);
const displayMode = ref("device");
const disableTimeouts = ref(true);
const preferredQuality = ref("auto");
const requestProxyUrl = ref("");
const showProxyCreationGuide = ref(false);
const requestProxyJsonpEnabled = ref(false);
const requestProxyCheckStatus = ref("idle");
let checkedRequestProxyUrl = "";
let checkedRequestProxyTransport = "fetch";
let requestProxyCheckSequence = 0;
const preferredQualityOptions = [
  "auto",
  "2160p",
  "1440p",
  "1080p",
  "720p",
  "480p",
  "360p",
  "240p",
  "144p",
  "audio",
];
const preferredQualityLabels = {
  auto: "自動",
  audio: "音声のみ",
};

// Backup state (for cancel functionality)
const backupState = ref({});

// localStorage キー
const STORAGE_KEY = "youtube_settings";

onMounted(() => {
  loadSettings();
  if (typeof window !== "undefined") {
    window.addEventListener(REQUEST_PROXY_HEALTH_EVENT, handleRequestProxyHealthEvent);
    window.addEventListener(REQUEST_PROXY_CONFIG_EVENT, handleRequestProxyConfigEvent);
  }
  restoreRequestProxyCheck();
  // apply current display mode to document
  try {
    applyDisplayMode(displayMode.value);
  } catch (e) {}
  saveBackup();

  // 設定をlocalStorageに保存するwatcher
  watch(
    [
      defaultPlaybackMode,
      autoplayEnabled,
      shortVideoFilterEnabled,
      shortVideoFilterMinutes,
      displayMode,
      disableTimeouts,
      preferredQuality,
    ],
    () => {
      saveToLocalStorage();
    },
    { deep: true }
  );
});

// computed boolean for template v-if — explicitly unwrap the ref value
const modalIsOpen = computed(() => {
  try {
    if (
      settingsModal &&
      settingsModal.isOpen &&
      typeof settingsModal.isOpen.value !== "undefined"
    ) {
      return !!settingsModal.isOpen.value;
    }
    // Fallback to localStorage if injected ref is missing
    const stored = localStorage.getItem("settingsModalOpen");
    return stored === "true";
  } catch (e) {
    return false;
  }
});

const requestProxyUrlError = computed(() => {
  if (!requestProxyUrl.value.trim()) return "";
  try {
    normalizeRequestProxyUrl(requestProxyUrl.value);
    return "";
  } catch {
    return "http:// または https:// で始まり、認証情報・クエリ・ハッシュを含まないURLを入力してください。この値はまだ適用されていません。";
  }
});

// モーダルを開いた時点の状態をバックアップ
watch(modalIsOpen, (open) => {
  if (open) {
    autoplayEnabled.value = loadAutoplay();
    const savedProxyUrl = loadRequestProxy().url;
    requestProxyJsonpEnabled.value = loadRequestProxyJsonp();
    requestProxyUrl.value = savedProxyUrl;
    restoreRequestProxyCheck(savedProxyUrl);
    saveBackup();
  }
});

// Watch displayMode so changes from elsewhere also apply immediately
watch(displayMode, (v) => {
  try {
    applyDisplayMode(v);
  } catch (e) {}
});

const loadSettings = () => {
  requestProxyUrl.value = loadRequestProxy().url;
  requestProxyJsonpEnabled.value = loadRequestProxyJsonp();
  autoplayEnabled.value = loadAutoplay();

  // First try to load from localStorage
  try {
    const savedSettings = loadFromLocalStorage();
    if (savedSettings) {
      defaultPlaybackMode.value = savedSettings.defaultPlaybackMode || "1";
      shortVideoFilterEnabled.value =
        savedSettings.shortVideoFilterEnabled || false;
      shortVideoFilterMinutes.value =
        savedSettings.shortVideoFilterMinutes || 4;
      saveShortVideoFilter(
        shortVideoFilterEnabled.value,
        shortVideoFilterMinutes.value,
      );
      displayMode.value = savedSettings.displayMode || "device";
      preferredQuality.value = savedSettings.preferredQuality || "auto";
      return;
    }
  } catch (e) {}

  // Load default playback mode
  defaultPlaybackMode.value = loadDefaultPlayback();

  // Load short video filter
  const filter = loadShortVideoFilter();
  shortVideoFilterEnabled.value = filter.enabled;
  shortVideoFilterMinutes.value = filter.minutes;

  // Load display mode (device/light/dark)
  try {
    displayMode.value = loadDisplayMode();
  } catch (e) {
    displayMode.value = "device";
  }
  // Load preferred quality
  try {
    preferredQuality.value = loadPreferredQuality();
  } catch (e) {
    preferredQuality.value = "auto";
  }

  // タイムアウト無効化設定を読み込み
  try {
    disableTimeouts.value = loadDisableTimeouts();
  } catch (e) {
    disableTimeouts.value = true;
  }
};

const saveBackup = () => {
  backupState.value = {
    defaultPlaybackMode: defaultPlaybackMode.value,
    autoplayEnabled: autoplayEnabled.value,
    shortVideoFilterEnabled: shortVideoFilterEnabled.value,
    shortVideoFilterMinutes: shortVideoFilterMinutes.value,
    displayMode: displayMode.value,
    preferredQuality: preferredQuality.value,
    requestProxyUrl: requestProxyUrl.value,
    requestProxyJsonpEnabled: requestProxyJsonpEnabled.value,
  };
};

const closeSettings = () => {
  showProxyCreationGuide.value = false;
  // 変更は watcher で保存済み
  if (settingsModal?.closeSettingsModal) {
    settingsModal.closeSettingsModal();
  }
};

// Event handlers
const handlePlaybackModeChange = (newMode) => {
  defaultPlaybackMode.value = newMode;
  saveDefaultPlayback(newMode);
};

const handleAutoplayChange = (enabled) => {
  autoplayEnabled.value = !!enabled;
  saveAutoplay(autoplayEnabled.value);
};

const handleFilterEnabledChange = (enabled) => {
  shortVideoFilterEnabled.value = enabled;
  saveShortVideoFilter(enabled, shortVideoFilterMinutes.value);
};

const handleFilterMinutesChange = (minutes) => {
  shortVideoFilterMinutes.value = minutes;
  saveShortVideoFilter(shortVideoFilterEnabled.value, minutes);
};

const handlePreferredQualityChange = (quality) => {
  preferredQuality.value = quality;
  try {
    savePreferredQuality(quality);
  } catch (e) {}
};

const applyDisplayMode = (mode) => {
  try {
    const isDark = computeIsDarkFromMode(mode);
    if (isDark) document.documentElement.classList.add("dark-mode");
    else document.documentElement.classList.remove("dark-mode");
    // do NOT set darkMode here to avoid legacy key conflicts
    // displayMode is the source of truth, darkMode is only for legacy compatibility
  } catch (e) {}
};

const handleDisplayModeChange = (newMode) => {
  displayMode.value = newMode;
  try {
    saveDisplayMode(newMode);
  } catch (e) {}
  // immediately apply
  applyDisplayMode(newMode);
};

const handleDisableTimeoutsChange = (enabled) => {
  disableTimeouts.value = !!enabled;
  try {
    saveDisableTimeouts(!!enabled);
  } catch (e) {}
};

const handleRequestProxyUrlChange = (url) => {
  requestProxyUrl.value = url;
  try {
    const normalizedProxyUrl = saveRequestProxy(url);
    if (
      normalizedProxyUrl !== checkedRequestProxyUrl ||
      currentRequestProxyTransport() !== checkedRequestProxyTransport
    ) {
      resetRequestProxyCheck();
    }
  } catch {
    // Keep showing the draft, but continue using the last valid saved URL.
    resetRequestProxyCheck();
  }
};

const resetRequestProxyCheck = () => {
  requestProxyCheckSequence += 1;
  checkedRequestProxyUrl = "";
  checkedRequestProxyTransport = "fetch";
  requestProxyCheckStatus.value = "idle";
};

const currentRequestProxyTransport = () => requestProxyTransport(
  requestProxyJsonpEnabled.value,
);

const currentDraftRequestProxyUrl = () => {
  try {
    return normalizeRequestProxyUrl(requestProxyUrl.value);
  } catch {
    return null;
  }
};

const applyRequestProxyHealthState = (state) => {
  if (!state || !["checking", "success", "error"].includes(state.status)) return false;
  if (
    state.url !== loadRequestProxy().url ||
    state.url !== currentDraftRequestProxyUrl() ||
    state.transport !== currentRequestProxyTransport()
  ) {
    return false;
  }
  checkedRequestProxyUrl = state.url;
  checkedRequestProxyTransport = state.transport;
  requestProxyCheckStatus.value = state.status;
  return true;
};

const handleRequestProxyHealthEvent = (event) => {
  applyRequestProxyHealthState(event?.detail);
};

const handleRequestProxyConfigEvent = () => {
  const savedJsonpEnabled = loadRequestProxyJsonp();
  if (savedJsonpEnabled === requestProxyJsonpEnabled.value) return;
  requestProxyJsonpEnabled.value = savedJsonpEnabled;
  restoreRequestProxyCheck();
};

const runRequestProxyCheck = async (
  proxyUrl,
  reason = "settings",
  { force = false } = {},
) => {
  resetRequestProxyCheck();
  const transport = currentRequestProxyTransport();
  checkedRequestProxyUrl = proxyUrl;
  checkedRequestProxyTransport = transport;
  requestProxyCheckStatus.value = "checking";

  const sequence = requestProxyCheckSequence;

  try {
    const state = await ensureRequestProxyHealth(proxyUrl, {
      reason,
      transport,
      force,
    });
    if (sequence !== requestProxyCheckSequence) return;
    applyRequestProxyHealthState(state);
  } catch {
    if (sequence !== requestProxyCheckSequence) return;
    requestProxyCheckStatus.value = "error";
  }
};

const restoreRequestProxyCheck = (proxyUrl = loadRequestProxy().url) => {
  resetRequestProxyCheck();
  if (!proxyUrl) return;

  const transport = currentRequestProxyTransport();
  const cached = loadRequestProxyHealth(proxyUrl, { transport });
  if (cached) {
    applyRequestProxyHealthState(cached);
    return;
  }
  runRequestProxyCheck(proxyUrl, "restore");
};

const handleRequestProxyJsonpToggle = () => {
  requestProxyJsonpEnabled.value = !requestProxyJsonpEnabled.value;
  saveRequestProxyJsonp(requestProxyJsonpEnabled.value);
  restoreRequestProxyCheck();
};

const handleRequestProxyRetry = () => {
  const proxyUrl = currentDraftRequestProxyUrl();
  if (!proxyUrl || proxyUrl !== loadRequestProxy().url) {
    resetRequestProxyCheck();
    return;
  }
  runRequestProxyCheck(proxyUrl, "manual-retry", { force: true });
};

const handleRequestProxyUrlCommit = (url) => {
  requestProxyUrl.value = url;
  let normalizedProxyUrl;
  try {
    normalizedProxyUrl = saveRequestProxy(url);
  } catch {
    resetRequestProxyCheck();
    return;
  }

  if (!normalizedProxyUrl) {
    resetRequestProxyCheck();
    return;
  }

  runRequestProxyCheck(normalizedProxyUrl, "settings");
};

onBeforeUnmount(() => {
  resetRequestProxyCheck();
  if (typeof window !== "undefined") {
    window.removeEventListener(REQUEST_PROXY_HEALTH_EVENT, handleRequestProxyHealthEvent);
    window.removeEventListener(REQUEST_PROXY_CONFIG_EVENT, handleRequestProxyConfigEvent);
  }
});

// localStorage関連の関数
const saveToLocalStorage = () => {
  try {
    const settingsData = {
      defaultPlaybackMode: defaultPlaybackMode.value,
      autoplayEnabled: autoplayEnabled.value,
      shortVideoFilterEnabled: shortVideoFilterEnabled.value,
      shortVideoFilterMinutes: shortVideoFilterMinutes.value,
      disableTimeouts: disableTimeouts.value,
      displayMode: displayMode.value,
      preferredQuality: preferredQuality.value,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsData));
  } catch (e) {}
};

const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (typeof data.disableTimeouts !== "undefined")
        disableTimeouts.value = !!data.disableTimeouts;
      return data;
    }
  } catch (e) {}
  return null;
};

const clearLocalStorage = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
};
</script>

<style scoped>
.settings-wrapper {
  /* 廃止 */
}

.settings-modal-overlay {
  position: fixed;
  top: 52px;
  left: var(--sidebar-offset, 250px);
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 9998;
  animation: fadeIn 0.3s ease;
  pointer-events: auto;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.settings-modal {
  position: fixed;
  top: 52px;
  left: var(
    --sidebar-offset,
    250px
  ); /* CSS variable を使ってサイドバー幅に追従 */
  bottom: 0;
  width: 380px;
  max-width: none;
  background-color: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  animation: slideInLeft 0.3s ease;
  transition: background-color 0.3s ease, border-color 0.3s ease;
  box-shadow: 2px 0 10px rgba(0, 0, 0, 0.1);
}

@keyframes slideInLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.settings-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-modal-header h2 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--text-primary);
}

.close-button {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: var(--text-primary);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
  border-radius: 4px;
}

.close-button:hover {
  background-color: var(--hover-bg);
}

.settings-modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-section {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  padding: 16px;
  border-radius: 8px;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.settings-section h3 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.autoplay-setting-group {
  display: grid;
  gap: 6px;
}

.autoplay-setting-group + .autoplay-setting-group {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.autoplay-setting-group h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.autoplay-setting-group > small {
  color: var(--text-secondary);
  line-height: 1.45;
}

.settings-section input.proxy-url-input {
  box-sizing: border-box;
  width: 100%;
  margin-top: 6px;
  margin-right: 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: text;
}

.settings-section input.proxy-url-input[aria-invalid="true"] {
  border-color: var(--danger);
}

.setting-error {
  display: block;
  margin-top: 8px;
  color: var(--danger);
}

.proxy-jsonp-toggle {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 5px;
  width: fit-content;
  max-width: 100%;
  margin-top: 8px;
  padding: 3px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease,
    color 0.2s ease;
}

.proxy-jsonp-toggle:hover {
  color: var(--text-primary);
  background: var(--hover-bg);
}

.proxy-jsonp-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.proxy-jsonp-toggle.is-active {
  color: #17652b;
  border-color: #17652b;
  background: transparent;
}

.proxy-jsonp-indicator {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid currentColor;
  border-radius: 3px;
  font-size: 9px;
  line-height: 1;
}

.proxy-jsonp-help {
  display: block;
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.45;
}

.proxy-check-status {
  position: relative;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin-top: 10px;
  padding: 9px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.85rem;
  line-height: 1.35;
}

.proxy-check-status-checking {
  color: var(--text-primary);
  background: var(--bg-primary);
  border-color: var(--border-color);
}

.proxy-check-status-success {
  color: #17652b;
  background: rgba(42, 138, 42, 0.12);
  border-color: #17652b;
  cursor: help;
}

.proxy-check-status-success:focus-visible {
  outline: 2px solid #17652b;
  outline-offset: 2px;
}

.proxy-check-status-error {
  color: var(--danger);
  background: rgba(204, 0, 0, 0.08);
  border-color: var(--danger);
}

.proxy-check-retry {
  flex: 0 0 auto;
  margin-left: 2px;
  padding: 3px 7px;
  border: 1px solid currentColor;
  border-radius: 4px;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1.25;
  cursor: pointer;
}

.proxy-check-retry:hover {
  background: rgba(204, 0, 0, 0.08);
}

.proxy-check-retry:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}

.proxy-check-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: var(--on-accent);
  background: #17652b;
  font-size: 0;
}

.proxy-check-icon::after {
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 800;
  content: "✓";
}

.proxy-check-status-error .proxy-check-icon::after {
  content: "!";
}

.proxy-check-status-error .proxy-check-icon {
  background: var(--danger);
}

.proxy-check-spinner {
  box-sizing: border-box;
  width: 19px;
  height: 19px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: proxyCheckSpin 0.8s linear infinite;
}

.proxy-check-info {
  flex: 0 0 auto;
  margin-left: 2px;
  font-size: 0.95rem;
  opacity: 0.85;
}

.proxy-check-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 20;
  box-sizing: border-box;
  width: min(290px, calc(100vw - 56px));
  padding: 10px 12px;
  border-radius: 6px;
  color: #fff;
  background: var(--ui-dark);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.55;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
  pointer-events: none;
}

.proxy-check-status-success:hover .proxy-check-tooltip,
.proxy-check-status-success:focus .proxy-check-tooltip,
.proxy-check-status-success:focus-within .proxy-check-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.proxy-url-help {
  display: block;
}

.proxy-creation-help {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.proxy-creation-help > p {
  margin: 0 0 8px;
  font-size: 0.85rem;
}

.proxy-creation-toggle {
  padding: 6px 10px;
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  color: var(--accent-color);
  background: transparent;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.proxy-creation-toggle:hover {
  background: var(--hover-bg);
}

.proxy-creation-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.proxy-creation-guide {
  display: grid;
  gap: 10px;
  padding: 20px;
  overflow-y: auto;
}

.proxy-guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.62);
}

.proxy-guide-dialog {
  display: flex;
  flex-direction: column;
  width: min(900px, 100%);
  max-height: calc(100vh - 48px);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  background: var(--bg-primary);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

.proxy-guide-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color);
}

.proxy-guide-header h2 {
  margin: 0;
  font-size: 1.2rem;
}

.proxy-creation-guide p {
  display: grid;
  gap: 4px;
  margin: 0;
  font-size: 0.85rem;
}

.proxy-creation-guide a {
  color: var(--accent-color);
  overflow-wrap: anywhere;
}

.proxy-creation-preview {
  box-sizing: border-box;
  width: 100%;
  min-height: min(540px, 60vh);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
}

@media (max-width: 600px) {
  .proxy-guide-overlay {
    padding: 10px;
  }

  .proxy-guide-dialog {
    max-height: calc(100vh - 20px);
  }

  .proxy-creation-guide {
    padding: 14px;
  }
}

:global(html.dark-mode) .proxy-check-status-success {
  color: #91e59e;
  background: rgba(77, 180, 92, 0.14);
  border-color: #91e59e;
}

:global(html.dark-mode) .proxy-jsonp-toggle.is-active {
  color: #91e59e;
  border-color: #91e59e;
  background: transparent;
}

:global(html.dark-mode) .proxy-check-status-success:focus-visible {
  outline-color: #91e59e;
}

:global(html.dark-mode) .proxy-check-status-error {
  color: var(--danger-weak);
  background: rgba(255, 102, 102, 0.12);
  border-color: var(--danger-weak);
}

@keyframes proxyCheckSpin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .proxy-check-spinner {
    animation: none;
  }

  .proxy-check-tooltip {
    transition: none;
  }
}

:global(html.dark-mode) .setting-error {
  color: var(--danger-weak);
}

.mode-group label,
.settings-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.mode-group label input,
.settings-section label input {
  margin-right: 8px;
  accent-color: var(--accent-color);
  cursor: pointer;
}

.filter-time {
  margin-top: 12px;
  padding: 12px;
  background-color: var(--bg-primary);
  border-radius: 4px;
  border-left: 3px solid var(--accent-color);
}

.filter-time label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.filter-time input[type="number"] {
  width: 80px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.filter-time small {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.custom-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0;
  margin: 0 0 12px 0;
  list-style: none;
}

.custom-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 4px;
  background-color: var(--bg-primary);
  border-radius: 4px;
  border: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.endpoint-text {
  word-break: break-all;
  margin-right: 8px;
  flex: 1;
  color: var(--text-primary);
}

.remove-btn {
  background: var(--danger-weak);
  border: none;
  color: var(--danger-text);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  white-space: nowrap;
  transition: opacity 0.2s ease;
}

.remove-btn:hover {
  opacity: 0.8;
}

.add-row {
  display: flex;
  gap: 8px;
}

.add-row input[type="text"] {
  flex: 1;
  padding: 8px;
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease,
    border-color 0.3s ease;
}

.add-row input[type="text"]:focus {
  outline: none;
  border-color: var(--accent-color);
}

.add-row button {
  padding: 8px 12px;
  cursor: pointer;
  background-color: var(--accent-color);
  color: var(--on-accent);
  border: none;
  border-radius: 4px;
  font-weight: 500;
  font-size: 0.85rem;
  white-space: nowrap;
  transition: opacity 0.2s ease;
}

.add-row button:hover {
  opacity: 0.8;
}

.settings-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-secondary);
}

.cancel-button {
  padding: 8px 16px;
  cursor: pointer;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-weight: 500;
  transition: background-color 0.2s ease;
}

.cancel-button:hover {
  background-color: var(--hover-bg);
}

@media (max-width: 768px) {
  .settings-modal {
    left: 0;
    width: 100%;
  }
}

@media (max-width: 1314px) and (min-width: 790px) {
  .settings-modal {
    left: var(--sidebar-offset, 250px);
  }
}

:deep(body.sidebar-compact) .settings-modal {
  left: 70px !important;
  width: 380px !important;
}

:deep(body.sidebar-hidden) .settings-modal {
  left: 0 !important;
  width: 367px !important;
}

/* Ensure fallback CSS variable exists on body for non-JS environments */
:deep(html) {
  --sidebar-offset: 250px;
}

@media (max-width: 789px) {
  .settings-modal {
    top: 64px;
    left: 0 !important;
    width: 100% !important;
    max-width: 100vw;
    box-sizing: border-box;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  .settings-modal-content { min-height: 0; }
  .settings-modal input, .settings-modal select, .settings-modal textarea { min-width: 0; font-size: 16px; }
  .settings-modal button { min-height: 44px; }
}

</style>
