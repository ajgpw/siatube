<template>
    <HeaderSearch 
      @search="onSearch" 
      @toggle-dark-mode="toggleDarkMode"
      @toggle-sidebar="handleToggleSidebar"
      :sidebar-open="sidebarOpen"
    />
    <Sidebar :open="sidebarOpen" :is-watch-page="route.path === '/watch'" />
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

<script>
import HeaderSearch from '@/components/HeaderSearch.vue';
import Sidebar from '@/components/Sidebar.vue';
import SettingsView from '@/views/SettingsView.vue';
import { ref, computed, provide, watch, onBeforeUnmount } from 'vue';
import { loadDisplayMode, computeIsDarkFromMode } from '@/utils/settingsManager';
import { useRoute } from 'vue-router';
import { API_CONNECTION_FAILURE_EVENT } from '@/services/siatubeApi';
import {
  checkForUpdate,
  fetchLatestBuildHtml,
  replaceDocumentWithHtml,
} from '@/utils/versionCheck';

export default {
  name: 'App',
  components: {
    HeaderSearch,
    Sidebar,
    SettingsView
  },
  setup() {
    console.log('[App.vue] setup() called');
    const route = useRoute();
    const viewportWidth = ref(window.innerWidth);
    // Initialize sidebarOpen based on screen width (consistent default)
    const sidebarOpen = ref(window.innerWidth >= 1315);
    const settingsModalOpen = ref(false);
    const connectionFailurePrompt = ref(false);
    const updateAvailable = ref(false);
    const currentVersion = ref("");
    const latestVersion = ref("");
    const temporaryUpdateLoading = ref(false);
    const temporaryUpdateError = ref(false);

    // Always initialize settingsModalOpen to false on page load
    console.log('[App.vue] Initialized settingsModalOpen to false on page load');

    const toggleSidebar = () => {
      sidebarOpen.value = !sidebarOpen.value;
    };

    const handleToggleSidebar = (isOpen) => {
      sidebarOpen.value = isOpen;
    };

    const openSettingsModal = () => {
      console.log('[App.vue] openSettingsModal called');
      settingsModalOpen.value = true;
    };

    const closeSettingsModal = () => {
      console.log('[App.vue] closeSettingsModal called');
      settingsModalOpen.value = false;
    };

    const handleApiConnectionFailure = () => {
      connectionFailurePrompt.value = true;
    };

    const openProxySettings = () => {
      connectionFailurePrompt.value = false;
      openSettingsModal();
    };

    const useLatestVersionTemporarily = async () => {
      if (temporaryUpdateLoading.value) return;
      temporaryUpdateLoading.value = true;
      temporaryUpdateError.value = false;
      try {
        const html = await fetchLatestBuildHtml();
        replaceDocumentWithHtml(html);
      } catch (error) {
        console.error('[App.vue] Failed to load latest temporary build', error);
        temporaryUpdateError.value = true;
        temporaryUpdateLoading.value = false;
      }
    };

    window.addEventListener(API_CONNECTION_FAILURE_EVENT, handleApiConnectionFailure);
    checkForUpdate().then(async (result) => {
      currentVersion.value = result.currentVersion;
      latestVersion.value = result.latestVersion;
      updateAvailable.value = result.updateAvailable;
      if (result.updateAvailable) {
        await useLatestVersionTemporarily();
      }
    }).catch(() => {});

    // Persist modal state to localStorage whenever it changes
    watch(settingsModalOpen, (newVal) => {
      console.log('[App.vue] settingsModalOpen changed to:', newVal);
      try {
        localStorage.setItem('settingsModalOpen', newVal ? 'true' : 'false');
      } catch (e) {
        console.warn('[App.vue] Failed to write settingsModalOpen to localStorage', e);
      }
      // Update body class for styling (e.g., sidebar max-height when settings is open)
      try {
        document.body.classList.toggle('settings-modal-open', newVal);
      } catch (e) {}
    });

    // Sync local state across tabs/windows
    const handleStorage = (e) => {
      if (!e || !e.key) return;
      if (e.key === 'settingsModalOpen') {
        const newVal = e.newValue === 'true';
        console.log('[App.vue] storage event for settingsModalOpen, newValue=', e.newValue);
        settingsModalOpen.value = newVal;
      }
    };
    window.addEventListener('storage', handleStorage);
    onBeforeUnmount(() => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(API_CONNECTION_FAILURE_EVENT, handleApiConnectionFailure);
    });

    // Update sidebarOpen when viewport resizes across thresholds
    const updateSidebarByWidth = () => {
      const w = window.innerWidth;
      if (w >= 1315) sidebarOpen.value = true;
      else if (w >= 790) sidebarOpen.value = false; // compact
      else sidebarOpen.value = false; // hidden
      viewportWidth.value = w;
    };
    window.addEventListener('resize', updateSidebarByWidth);

    // Monitor route changes - only control sidebar for /watch page
    // For other pages, preserve the user's current sidebar state
    const watchPageOpen = ref(null); // Store sidebar state before entering /watch
    watch(() => route.path, (newPath) => {
      if (newPath === '/watch') {
        // Entering /watch: store current state and set to hidden
        if (watchPageOpen.value === null) {
          watchPageOpen.value = sidebarOpen.value;
        }
        sidebarOpen.value = false;
      } else if (watchPageOpen.value !== null) {
        // Leaving /watch: restore previous state
        sidebarOpen.value = watchPageOpen.value;
        watchPageOpen.value = null;
      }
      // For other page transitions, don't modify sidebarOpen
    });

    // Provide settings modal functions
    console.log('[App.vue] Providing settingsModal with isOpen:', settingsModalOpen);
    provide('settingsModal', {
      isOpen: settingsModalOpen,
      openSettingsModal,
      closeSettingsModal,
    });

    return {
      route,
      sidebarOpen,
      toggleSidebar,
      handleToggleSidebar,
      viewportWidth,
      settingsModalOpen,
      connectionFailurePrompt,
      openProxySettings,
      updateAvailable,
      currentVersion,
      latestVersion,
      temporaryUpdateLoading,
      temporaryUpdateError,
      useLatestVersionTemporarily,
    };
  },
  methods: {
    onSearch(keyword) {
      if (!keyword || !keyword.trim()) return;
      this.$router?.push({ path: '/search', query: { q: keyword.trim() } });
    },
    toggleDarkMode(isDarkMode) {
      // This method is for legacy compatibility; new code should use SettingsView
      if (isDarkMode) {
        document.documentElement.classList.add('dark-mode');
      } else {
        document.documentElement.classList.remove('dark-mode');
      }
      // update legacy key only for backward compatibility
      try { localStorage.setItem('darkMode', isDarkMode ? 'true' : 'false'); } catch(e) {}
    }
  },
  mounted() {
    // ページ読み込み時に表示モードを読み込んでダークモードを適用
    try {
      const mode = loadDisplayMode();
      const isDarkMode = computeIsDarkFromMode(mode);
      console.log(`[App.vue] mounted: displayMode=${mode} -> isDarkMode=${isDarkMode}`);
      if (isDarkMode) {
        document.documentElement.classList.add('dark-mode');
      } else {
        document.documentElement.classList.remove('dark-mode');
      }
    } catch (e) {
      console.warn('[App.vue] Error loading displayMode on mount', e);
      // Fallback: do not apply dark mode if loading fails
    }

    // ウィンドウリサイズは setup() 側で管理しています
  }
};
</script>

<style>
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
