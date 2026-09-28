<template>
  <aside class="sidebar" :class="{ 'compact-mode': !isOpen && !isHidden, 'hidden-mode': isHidden, 'is-open': isHidden && isOpen }">
    <nav class="sidebar-nav" aria-label="メインメニュー">
      <router-link to="/" class="sidebar-item" :class="{ active: isActive('/') }">
        <span class="sidebar-icon">
          <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="m11.485 2.143-8 4.8-2 1.2a1 1 0 001.03 1.714L3 9.567V20a2 2 0 002 2h6v-7h2v7h6a2 2 0 002-2V9.567l.485.29a1 1 0 001.03-1.714l-2-1.2-8-4.8a1 1 0 00-1.03 0ZM5 8.366l7-4.2 7 4.2V20h-4v-5.5a1.5 1.5 0 00-1.5-1.5h-3A1.5 1.5 0 009 14.5V20H5V8.366Z"></path></svg></div></span>
        </span>
        <span class="sidebar-label">ホーム</span>
      </router-link>
      
      <router-link to="/subscriptions" class="sidebar-item" :class="{ active: isActive('/subscriptions') }">
        <span class="sidebar-icon">
          <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M18 1H6a2 2 0 00-2 2h16a2 2 0 00-2-2Zm3 4H3a2 2 0 00-2 2v13a2 2 0 002 2h18a2 2 0 002-2V7a2 2 0 00-2-2ZM3 20V7h18v13H3Zm13-6.5L10 10v7l6-3.5Z"></path></svg></div></span>
        </span>
        <span class="sidebar-label">登録チャンネル</span>
      </router-link>
      
      <router-link to="/playlists" class="sidebar-item" :class="{ active: isActive('/playlists') }">
        <span class="sidebar-icon">
          <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M16 15.395a.5.5 0 01.762-.426L22.5 18.5l-5.738 3.531a.5.5 0 01-.762-.425v-6.212ZM14 19H4a1 1 0 110-2h10v2Zm6-8a1 1 0 110 2H4a1 1 0 110-2h16Zm0-6a1 1 0 110 2H4a1 1 0 010-2h16Z"></path></svg></div></span>
        </span>
        <span class="sidebar-label">再生リスト</span>
      </router-link>
      
      <router-link to="/history" class="sidebar-item" :class="{ active: isActive('/history') }">
        <span class="sidebar-icon">
          <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M8.76 1.487a11 11 0 11-7.54 12.706 1 1 0 011.96-.4 9 9 0 0014.254 5.38A9 9 0 0016.79 4.38 9 9 0 004.518 7H7a1 1 0 010 2H1V3a1 1 0 012 0v2.678a11 11 0 015.76-4.192ZM12 6a1 1 0 00-1 1v5.58l.504.288 3.5 2a1 1 0 10.992-1.736L13 11.42V7a1 1 0 00-1-1Z"></path></svg></div></span>
        </span>
        <span class="sidebar-label">履歴</span>
      </router-link>
      
      <button 
        type="button" 
        class="sidebar-item sidebar-button" 
        @click="openSettings"
        :class="{ active: isActive('/settings') }"
      >
        <span class="sidebar-icon">
          <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost"><div style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12.844 1h-1.687a2 2 0 00-1.962 1.616 3 3 0 01-3.92 2.263 2 2 0 00-2.38.891l-.842 1.46a2 2 0 00.417 2.507 3 3 0 010 4.525 2 2 0 00-.417 2.507l.843 1.46a2 2 0 002.38.892 3.001 3.001 0 013.918 2.263A2 2 0 0011.157 23h1.686a2 2 0 001.963-1.615 3.002 3.002 0 013.92-2.263 2 2 0 002.38-.892l.842-1.46a2 2 0 00-.418-2.507 3 3 0 010-4.526 2 2 0 00.418-2.508l-.843-1.46a2 2 0 00-2.38-.891 3 3 0 01-3.919-2.263A2 2 0 0012.844 1Zm-1.767 2.347a6 6 0 00.08-.347h1.687a4.98 4.98 0 002.407 3.37 4.98 4.98 0 004.122.4l.843 1.46A4.98 4.98 0 0018.5 12a4.98 4.98 0 001.716 3.77l-.843 1.46a4.98 4.98 0 00-4.123.4A4.979 4.979 0 0012.843 21h-1.686a4.98 4.98 0 00-2.408-3.371 4.999 4.999 0 00-4.12-.399l-.844-1.46A4.979 4.979 0 005.5 12a4.98 4.98 0 00-1.715-3.77l.842-1.459a4.98 4.98 0 004.123-.399 4.981 4.981 0 002.327-3.025ZM16 12a4 4 0 11-7.999 0 4 4 0 018 0Zm-4 2a2 2 0 100-4 2 2 0 000 4Z"></path></svg></div></span>
        </span>
        <span class="sidebar-label">設定</span>
      </button>
    </nav>
  </aside>
</template>

<script>
import { useRoute } from 'vue-router';
import { ref, computed, onMounted, watch, inject, onUnmounted, nextTick } from 'vue';

export default {
  name: 'Sidebar',
  props: {
    open: {
      type: Boolean,
      default: true
    }
    ,
    isWatchPage: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const isOpen = ref(props.open);
    const viewportWidth = ref(window.innerWidth);
    const settingsModal = inject('settingsModal', {});
    const SIDEBAR_STATE_KEY = 'youtube_sidebar_state';

    // ビューポート幅に基づいて非表示モードかどうかを判定
    // 通常は 790px 未満で hidden。動画再生ページでは 1330px 未満で hidden にする
    const isHidden = computed(() => {
      const threshold = props.isWatchPage ? 1330 : 790;
      return viewportWidth.value < threshold;
    });

    // 初期状態を設定
    const initializeState = () => {
      const width = window.innerWidth;
      if (width >= 1315) {
        isOpen.value = true;
      } else if (width >= 790) {
        isOpen.value = false; // compact
      } else {
        isOpen.value = false; // hidden on small screens (isHidden will handle display)
      }
    };

    // 非表示モードで開閉ボタンをトグル
    const toggleSidebarInHiddenMode = () => {
      if (isHidden.value) {
        isOpen.value = !isOpen.value;
      }
    };

    // body クラスを更新して他のコンポーネント（SettingsView など）が
    // サイドバー状態を参照できるようにする
    const updateBodyClass = () => {
      const body = document.body;
      // determine logical state
      let state = 'open';
      if (isHidden.value) state = 'hidden';
      else if (!isOpen.value) state = 'compact';

      // update classes
      body.classList.toggle('sidebar-compact', state === 'compact');
      body.classList.toggle('sidebar-hidden', state === 'hidden');

      // update CSS variable for offset (used by SettingsView)
      const offsetMap = {
        open: '250px',
        compact: '70px',
        hidden: '0px'
      };
      const offset = offsetMap[state] || '250px';
      body.style.setProperty('--sidebar-offset', offset);

      // debug log for visibility
      console.log(`[Sidebar.vue] updateBodyClass: isOpen=${isOpen.value}, isHidden=${isHidden.value}, state=${state}, stored=${localStorage.getItem(SIDEBAR_STATE_KEY)}`);

      // persist to localStorage
      try {
        localStorage.setItem(SIDEBAR_STATE_KEY, state);
        console.log(`[Sidebar.vue] Saved to localStorage: youtube_sidebar_state=${state}`);
      } catch (e) {
        console.error('[Sidebar.vue] Failed to save to localStorage', e);
      }
    };

    const openSettings = () => {
      console.log('[Sidebar.vue] openSettings called');
      console.log('[Sidebar.vue] settingsModal object:', settingsModal);
      console.log('[Sidebar.vue] settingsModal.openSettingsModal exists:', !!settingsModal?.openSettingsModal);
      if (settingsModal?.openSettingsModal) {
        console.log('[Sidebar.vue] Calling openSettingsModal()');
        settingsModal.openSettingsModal();
      } else {
        console.warn('[Sidebar.vue] WARNING: openSettingsModal is not available');
      }
    };

    const route = useRoute();
    const isActive = (path) => route.path === path;

    onMounted(() => {
      // Clear localStorage sidebar state on page load - always use screen-size defaults
      try {
        localStorage.removeItem(SIDEBAR_STATE_KEY);
        console.log('[Sidebar.vue] Cleared persisted sidebar state, using screen-size defaults');
      } catch (e) {
        console.warn('[Sidebar.vue] Failed to clear sidebar state from localStorage', e);
      }

      // Initialize state based on current screen width
      initializeState();

      // Ensure updateBodyClass is called immediately and synchronously
      // to set the correct initial state in localStorage
      updateBodyClass();
      
      // Also trigger after nextTick to ensure watch handlers run
      try {
        nextTick(() => {
          updateBodyClass();
        });
      } catch (e) {
        // fallback: call synchronously
        updateBodyClass();
      }

      // ウィンドウリサイズリスナー
      const handleResize = () => {
        viewportWidth.value = window.innerWidth;
        initializeState();
        updateBodyClass();
      };
      window.addEventListener('resize', handleResize);
    });

    // propsの変更を監視
    watch(() => props.open, (newValue) => {
      isOpen.value = newValue;
    });

    // isOpen が変化したら body クラスを更新
    watch([isOpen, isHidden], () => {
      updateBodyClass();
    });

    onUnmounted(() => {
      // クリーンアップ: body のクラスを削除
      const body = document.body;
      body.classList.remove('sidebar-compact');
      body.classList.remove('sidebar-hidden');
    });

    return {
      isOpen,
      isHidden,
      viewportWidth,
      settingsModal,
      openSettings,
      isActive,
      toggleSidebarInHiddenMode
    };
  },
  methods: {
    isActive(path) {
      return this.$route.path === path;
    }
  }
};
</script>

<style scoped>
.sidebar {
  position: fixed;
  left: 0;
  top: 52px;
  width: 250px;
  height: calc(100vh - 52px);
  background-color: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-x: none;
  touch-action: pan-y;
  z-index: 10;
  transition: width 0.3s ease, height 0.3s ease;
}

/* When settings modal is open, limit sidebar height to match settings panel */
:global(body.settings-modal-open) .sidebar {
  height: auto;
  max-height: calc(100vh - 52px);
}

.sidebar.compact-mode {
  width: 70px;
}

.sidebar.hidden-mode {
  display: none;
}

.sidebar.hidden-mode.is-open {
  display: block;
  width: 250px;
  z-index: 999;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.sidebar-nav {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  padding: 12px 0;
}

.sidebar-item {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 12px 24px;
  color: var(--text-primary);
  text-decoration: none;
  transition: background-color 0.2s ease;
  border-left: 3px solid transparent;
}

.sidebar-item.sidebar-button {
  background: none;
  border: none;
  cursor: pointer;
  width: 100%;
  text-align: left;
}

.sidebar.compact-mode .sidebar-item {
  padding: 12px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.sidebar-item:hover {
  background-color: var(--hover-bg);
}

.sidebar-item.active {
  background-color: var(--hover-bg);
  border-left-color: var(--accent-color);
  color: var(--accent-color);
  font-weight: 600;
}

.sidebar.compact-mode .sidebar-item.active {
  border-left: none;
  border-bottom: 3px solid var(--accent-color);
}

.sidebar-icon {
  margin-right: 16px;
  font-size: 20px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.sidebar.compact-mode .sidebar-icon {
  margin-right: 0;
}

.sidebar-label {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar.compact-mode .sidebar-label {
  display: block;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 73px;
  text-align: center;
  line-height: 1.2;
}

@media (max-width: 1314px) {
  .sidebar {
    width: 250px;
  }

  .sidebar.compact-mode {
    width: 70px;
  }
}

@media (max-width: 789px) {
  .sidebar {
    display: none;
  }

  .sidebar.hidden-mode {
    display: none;
  }

  .sidebar.hidden-mode.is-open {
    display: block;
    width: 250px;
    z-index: 999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }
}

/* On phones the same navigation becomes a persistent bottom bar. */
@media (max-width: 789px) {
  .sidebar,
  .sidebar.hidden-mode,
  .sidebar.hidden-mode.is-open,
  :global(body.settings-modal-open) .sidebar {
    display: block;
    top: auto;
    bottom: 0;
    width: 100%;
    height: auto;
    max-height: none;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    border-right: 0;
    border-top: 1px solid var(--border-color);
    box-shadow: 0 -2px 12px rgb(0 0 0 / 6%);
    z-index: 1000;
  }
  .sidebar-nav { flex-direction: row; padding: 0; }
  .sidebar-item, .sidebar-item.sidebar-button {
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-height: 64px;
    padding: 8px 2px;
    border: 0;
    border-top: 3px solid transparent;
  }
  .sidebar-item.active { border-top-color: var(--accent-color); }
  .sidebar-icon { margin: 0; }
  .sidebar-label { font-size: 10px; line-height: 1.4; max-width: 100%; }
  .sidebar-item:focus-visible { outline: 2px solid var(--accent-color); outline-offset: -3px; }
}

</style>
