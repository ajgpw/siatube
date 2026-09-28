<template>
    <HeaderSearch 
      @search="onSearch" 
      @toggle-dark-mode="toggleDarkMode"
      @toggle-sidebar="handleToggleSidebar"
      :sidebar-open="sidebarOpen"
    />
    <Sidebar :open="sidebarOpen" :is-watch-page="route.path === '/watch'" />
    <div v-if="guardProgressMessage" class="guard-progress" role="status" aria-live="polite">
      <span class="guard-progress-spinner" aria-hidden="true"></span>
      {{ guardProgressMessage }}
    </div>
    <main class="app-content" :class="{ 'sidebar-closed': !sidebarOpen }">
      <div v-if="updateAvailable && temporaryUpdateError" class="version-warning" role="alert">
        <div>
          <strong>自動更新に失敗しました</strong>
          <p>現在: {{ currentVersion }} ／ 最新: {{ latestVersion }}</p>
          <p v-if="temporaryUpdateError" class="temporary-update-error">
            最新バージョンを読み込めませんでした。通信またはプロキシ設定を確認してください。
          </p>
        </div>
        <div class="version-warning-actions">
          <button
            type="button"
            class="use-latest-version"
            :disabled="temporaryUpdateLoading"
            @click="useLatestVersionTemporarily"
          >
            {{ temporaryUpdateLoading ? "読み込み中…" : "最新バージョンへの切り替えを再試行" }}
          </button>
          <button
            type="button"
            class="dismiss-version-warning"
            aria-label="更新のお知らせを閉じる"
            @click="updateAvailable = false"
          >✕</button>
        </div>
      </div>
      <div
        v-if="connectionFailurePrompt"
        class="proxy-connection-prompt"
        role="alert"
      >
        <div class="proxy-connection-message">
          <strong>API通信がブロックされている可能性が高いです</strong>
          <p>接続確認用のJSONを取得できませんでした。ネットワークでフィルタリングされている場合は、プロキシを設定してください。</p>
        </div>
        <div class="proxy-connection-actions">
          <button type="button" class="open-proxy-settings" @click="openProxySettings">
            プロキシ設定を開く
          </button>
          <button
            type="button"
            class="dismiss-proxy-prompt"
            aria-label="プロキシ設定の案内を閉じる"
            @click="connectionFailurePrompt = false"
          >
            ✕
          </button>
        </div>
      </div>
      <router-view />
    </main>
    <SettingsView />
</template>

<script setup>
import { onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import HeaderSearch from "@/components/layout/HeaderSearch.vue";
import Sidebar from "@/components/layout/Sidebar.vue";
import SettingsView from "@/views/SettingsView.vue";
import { useAppNotifications } from "@/composables/useAppNotifications.js";
import { useSettingsModal } from "@/composables/useSettingsModal.js";
import { useSidebar } from "@/composables/useSidebar.js";
import {
  loadDisplayMode,
  computeIsDarkFromMode,
} from "@/services/storage/settingsManager.js";

const route = useRoute();
const router = useRouter();
const { sidebarOpen, handleToggleSidebar } = useSidebar(route);
const { openSettingsModal } = useSettingsModal();
const {
  connectionFailurePrompt,
  guardProgressMessage,
  openProxySettings,
  updateAvailable,
  currentVersion,
  latestVersion,
  temporaryUpdateLoading,
  temporaryUpdateError,
  useLatestVersionTemporarily,
} = useAppNotifications(openSettingsModal);

function onSearch(keyword) {
  if (!keyword || !keyword.trim()) return;
  router.push({ path: "/search", query: { q: keyword.trim() } });
}

function toggleDarkMode(isDarkMode) {
  document.documentElement.classList.toggle("dark-mode", isDarkMode);
  // Keep the legacy preference in sync with the header control.
  try {
    localStorage.setItem("darkMode", isDarkMode ? "true" : "false");
  } catch {}
}

onMounted(() => {
  try {
    document.documentElement.classList.toggle(
      "dark-mode",
      computeIsDarkFromMode(loadDisplayMode()),
    );
  } catch (error) {
    console.warn("Failed to apply the saved display mode", error);
  }
});
</script>

<style>
.guard-progress {
  position: fixed;
  z-index: 1400;
  top: 76px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 10px 14px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  color: var(--text-primary, #111827);
  background: var(--background-color, #fff);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
  font-size: 0.92rem;
}

.guard-progress-spinner {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: guard-progress-spin 0.8s linear infinite;
}

@keyframes guard-progress-spin {
  to { transform: rotate(360deg); }
}

.version-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 12px;
  padding: 12px 16px;
  border: 1px solid #eab308;
  border-radius: 8px;
  color: #713f12;
  background: #fef9c3;
}

.version-warning p {
  margin: 4px 0 0;
  font-size: 0.9rem;
}

.dismiss-version-warning {
  border: 0;
  padding: 6px 9px;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.version-warning-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.use-latest-version {
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 8px 12px;
  color: inherit;
  background: rgba(255, 255, 255, 0.45);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.use-latest-version:disabled {
  cursor: wait;
  opacity: 0.65;
}

.temporary-update-error {
  color: #b91c1c;
  font-weight: 600;
}

html.dark-mode .version-warning {
  color: #fef08a;
  background: #422006;
}

html.dark-mode .use-latest-version {
  background: rgba(0, 0, 0, 0.2);
}

html.dark-mode .temporary-update-error {
  color: #fca5a5;
}

@media (max-width: 600px) {
  .version-warning {
    align-items: flex-start;
    flex-direction: column;
  }

  .version-warning-actions {
    width: 100%;
  }

  .use-latest-version {
    flex: 1;
  }
}

#app {
  padding-top: 52px;
  box-sizing: border-box;
}

.app-content {
  margin-left: 250px;
  transition: margin-left 0.3s ease;
}

.proxy-connection-prompt {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 14px 16px;
  padding: 18px 20px;
  border: 2px solid #d97706;
  border-left-width: 7px;
  border-radius: 8px;
  color: var(--text-primary);
  background: #fff7ed;
  box-shadow: 0 4px 16px rgba(217, 119, 6, 0.2);
}

.proxy-connection-message strong {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #9a3412;
  font-size: clamp(1.15rem, 2vw, 1.45rem);
  line-height: 1.35;
}

.proxy-connection-message strong::before {
  flex: 0 0 auto;
  content: "⚠️";
  font-size: 1.35em;
}

.proxy-connection-prompt p {
  margin: 8px 0 0;
  font-size: 0.96rem;
  line-height: 1.55;
}

.proxy-connection-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.open-proxy-settings,
.dismiss-proxy-prompt {
  border: none;
  border-radius: 5px;
  font: inherit;
  cursor: pointer;
}

.open-proxy-settings {
  padding: 11px 16px;
  color: var(--on-accent);
  background: var(--accent-color);
  font-weight: 600;
}

html.dark-mode .proxy-connection-prompt {
  border-color: #fb923c;
  background: #431b0b;
  box-shadow: 0 4px 18px rgba(251, 146, 60, 0.18);
}

html.dark-mode .proxy-connection-message strong {
  color: #fdba74;
}

.dismiss-proxy-prompt {
  padding: 7px 9px;
  color: var(--text-primary);
  background: transparent;
}

.open-proxy-settings:focus-visible,
.dismiss-proxy-prompt:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .proxy-connection-prompt {
    align-items: flex-start;
    flex-direction: column;
  }

  .proxy-connection-actions {
    width: 100%;
  }

  .open-proxy-settings {
    flex: 1;
  }
}

@media (min-width: 1315px) {
  .app-content {
    margin-left: 250px;
  }

  .app-content.sidebar-closed {
    margin-left: 70px;
  }
}
@media (min-width: 790px) and (max-width: 1314px) {
  /* Default to open width unless the sidebar is explicitly closed */
  .app-content {
    margin-left: 250px;
  }

  .app-content.sidebar-closed {
    margin-left: 70px;
  }
}

@media (max-width: 1330px) {
  .app-content > .yt-watch-page {
  }
  .app-content > .yt-watch-page {
  }
  .app-content:has(> .yt-watch-page) {
    margin-left: 0px;
  }
}


@media (max-width: 789px) {
  .app-content {
    margin-left: 0;
  }
}

@media (max-width: 789px) {
  #app { padding-top: 64px; padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
  .app-content { min-width: 0; }
}

</style>
