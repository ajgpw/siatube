<template>
  <div class="header-wrapper fixed-header">
    <button
      type="button"
      class="toggle-sidebar-button"
      @click="toggleSidebar"
      aria-label="サイドバーを切り替え"
      :aria-expanded="sidebarOpen"
    >
      <div
        style="width: 100%; height: 100%; display: block; fill: currentcolor"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          height="24"
          viewBox="0 0 24 24"
          width="24"
          focusable="false"
          aria-hidden="true"
          style="
            pointer-events: none;
            display: inherit;
            width: 100%;
            height: 100%;
          "
        >
          <path
            d="M20 5H4a1 1 0 000 2h16a1 1 0 100-2Zm0 6H4a1 1 0 000 2h16a1 1 0 000-2Zm0 6H4a1 1 0 000 2h16a1 1 0 000-2Z"
          ></path>
        </svg>
      </div>
    </button>

    <button
      type="button"
      class="home-button"
      @click="$router.push('/')"
      aria-label="トップページへ戻る"
      style="background: var(--bg-primary)"
    >
      <span class="brand-play-icon" aria-hidden="true"></span>
      <span class="brand-name">siatube</span>
    </button>
    <form
      @submit.prevent="submitSearch"
      class="header-search"
      ref="searchFormRef"
    >
      <input
        type="text"
        v-model="query"
        @input="onInput"
        @keydown.down.prevent="moveSelection(1)"
        @keydown.up.prevent="moveSelection(-1)"
        @keydown.enter.prevent="onEnter"
        placeholder="キーワードを入力..."
        autocomplete="off"
        class="search-input"
        aria-label="動画を検索"
        enterkeyhint="search"
      />
      <button
        v-if="query"
        type="button"
        class="clear-button"
        @click="clearQuery"
        aria-label="入力をクリア"
      >
        ×
      </button>

      <button type="submit" class="search-button" aria-label="検索">
        <img
          :src="isDarkMode ? searchIconBlack : searchiconIcon"
          alt="🔍"
          style="width: 20px; height: 20px"
        />
      </button>

      <ul v-if="suggestions.length" class="suggestions-list" role="listbox">
        <li
          v-for="(item, index) in suggestions"
          :key="index"
          :class="{ selected: index === selectedIndex }"
          @mousedown.prevent="onSuggestionClick(index)"
          role="option"
          :aria-selected="index === selectedIndex"
        >
          {{ item }}
        </li>
      </ul>
    </form>
  </div>
</template>

<script setup>
import searchiconIcon from "/Image/search-icon.txt?raw";
import searchIconBlack from "/Image/search-icon-black.txt?raw";

import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import {
  fetchSearchSuggestions,
  moveSelectionIndex,
} from "@/utils/searchManager";
import {
  loadDisplayMode,
  computeIsDarkFromMode,
} from "@/utils/settingsManager";

const emit = defineEmits([
  "search",
  "toggle-dark-mode",
  "toggle-sidebar",
]);

// Search state
const query = ref("");
const suggestions = ref([]);
const selectedIndex = ref(-1);
let fetchController = null;
const searchFormRef = ref(null);

const displayMode = ref("device");
const isDarkMode = ref(false);
let mq = null;
let mqHandler = null;
let classObserver = null;

const updateDarkFromDocClass = () => {
  try {
    isDarkMode.value =
      document && document.documentElement && document.documentElement.classList
        ? document.documentElement.classList.contains("dark-mode")
        : false;
  } catch (e) {
    isDarkMode.value = false;
  }
};

// Receive sidebar state from parent
const props = defineProps({ sidebarOpen: { type: Boolean, default: true } });

/**
 * 検索フォーム外クリックで候補を閉じる
 */
const onClickOutside = (event) => {
  if (searchFormRef.value && !searchFormRef.value.contains(event.target)) {
    suggestions.value = [];
    selectedIndex.value = -1;
  }
};
onMounted(() => {
  document.addEventListener("click", onClickOutside);

  // Load display mode (device/light/dark)
  try {
    displayMode.value = loadDisplayMode();
    isDarkMode.value = computeIsDarkFromMode(displayMode.value);
  } catch (e) {
    displayMode.value = "device";
    isDarkMode.value = computeIsDarkFromMode(displayMode.value);
  }

  // initialize from document class and observe changes so header icon updates when SettingsView toggles dark-mode
  try {
    updateDarkFromDocClass();
    if (window.MutationObserver) {
      classObserver = new MutationObserver(() => updateDarkFromDocClass());
      classObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
  } catch (e) {}
});

onBeforeUnmount(() => {
  document.removeEventListener("click", onClickOutside);
  // detach system color scheme listener if attached
  try {
    if (mq && mqHandler) {
      if (mq.removeEventListener) mq.removeEventListener("change", mqHandler);
      else if (mq.removeListener) mq.removeListener(mqHandler);
    }
  } catch (e) {}

  // disconnect mutation observer
  try {
    if (classObserver) classObserver.disconnect();
  } catch (e) {}
});

/**
 * 検索候補を取得
 */
const onInput = async () => {
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();
  suggestions.value = await fetchSearchSuggestions(
    query.value.trim(),
    fetchController.signal
  );
  selectedIndex.value = -1;
};

/**
 * 選択を上下移動
 */
const moveSelection = (delta) => {
  selectedIndex.value = moveSelectionIndex(
    selectedIndex.value,
    delta,
    suggestions.value.length
  );
  if (selectedIndex.value >= 0) {
    query.value = suggestions.value[selectedIndex.value];
  }
};

/**
 * Enter キーで検索
 */
const onEnter = () => {
  submitSearch();
};

/**
 * 候補をクリック
 */
const onSuggestionClick = (index) => {
  query.value = suggestions.value[index];
  submitSearch();
};

/**
 * 検索を実行
 */
const submitSearch = () => {
  const trimmed = query.value.trim();
  if (!trimmed) return;
  suggestions.value = [];
  selectedIndex.value = -1;
  emit("search", trimmed);
};

/**
 * クリアボタン
 */
const clearQuery = () => {
  query.value = "";
  suggestions.value = [];
  selectedIndex.value = -1;
};

// ダークモード状態の監視
watch(
  isDarkMode,
  (newValue) => {
    // DOM更新トリガー用
  },
  { deep: true }
);

/**
 * サイドバー初期状態を設定
 */
/**
 * サイドバーをトグル（親に状態反映を依頼）
 */
const toggleSidebar = () => {
  emit("toggle-sidebar", !props.sidebarOpen);
};

// ビューポートは親が管理するようにしたためローカルでの監視は不要
</script>

<style scoped>
.toggle-sidebar-button {
  border: none;
  background: transparent;
  color: var(--text-primary);
  width: 40px;
  height: 40px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
  margin-right: 8px;
  flex-shrink: 0;
}

.toggle-sidebar-button:hover {
  background-color: var(--hover-bg);
  border-radius: 4px;
}

.clear-button {
  position: absolute;
  right: 1.9em;
  bottom: -1px;
  background: transparent;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0 0.5em;
  height: calc(100% - 1px);
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  user-select: none;
  transition: color 0.2s ease;
}

.clear-button:hover {
  color: var(--text-primary);
}

.header-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 100vw;
  padding: 0.5rem 1rem;
  box-sizing: border-box;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  height: 54px;
  position: fixed;
  top: 0;
  left: 0;
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.3s ease, color 0.3s ease,
    border-color 0.3s ease;
}

.home-button {
  border: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 8px;
  width: auto;
  height: 36px;
  padding: 0 8px;
  gap: 7px;
  cursor: pointer;
  user-select: none;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.5s ease;
  flex-shrink: 0;
}

.home-button:hover {
  background: var(--hover-bg);
}

.brand-play-icon {
  position: relative;
  width: 30px;
  height: 21px;
  flex-shrink: 0;
  border-radius: 7px;
  background: #ff0033;
}

.brand-play-icon::after {
  position: absolute;
  top: 50%;
  left: 52%;
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid #fff;
  content: "";
  transform: translate(-50%, -50%);
}

.brand-name {
  font-size: 20px;
  font-weight: 750;
  line-height: 1;
  letter-spacing: -0.4px;
}

.header-search {
  display: flex;
  align-items: center;
  flex: 1;
  max-width: 600px;
  margin: 0 auto;
  position: relative;
  height: 40px;
}

.search-input {
  flex: 1;
  height: 100%;
  padding: 5px 12px 7px 12px;
  line-height: 28px;
  border-radius: 20px 0 0 20px;
  border: 1px solid var(--search-border);
  outline: none;
  font-size: 0.9rem;
  box-sizing: border-box;
  text-align: left;
  vertical-align: middle;
  background-color: var(--bg-secondary);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease,
    border-color 0.3s ease;
}

.search-input::placeholder {
  color: var(--text-secondary);
}

.search-button {
  border-radius: 0 20px 20px 0;
  border: 1px solid var(--search-border);
  border-left: none;
  background-color: var(--bg-secondary);
  cursor: pointer;
  padding: 0 0.75em;
  font-size: 1.1rem;
  user-select: none;
  height: 100%;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  transition: background-color 0.3s ease;
}

.search-button:hover {
  background-color: var(--hover-bg);
}

.suggestions-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-top: none;
  max-height: 250px;
  overflow-y: auto;
  z-index: 10;
  border-radius: 0 0 10px 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  transition: background-color 0.3s ease;
}

.suggestions-list li {
  padding: 0.5em 1em;
  cursor: pointer;
  color: var(--text-primary);
  transition: background-color 0.3s ease;
}

.suggestions-list li.selected,
.suggestions-list li:hover {
  background-color: var(--hover-bg);
}

.search-input { min-width: 0; padding-right: 44px; }
.search-input:focus-visible { outline: 2px solid var(--accent-color); outline-offset: -2px; }
@media (max-width: 789px) {
  .header-wrapper { height: 64px; padding: 8px 12px; gap: 10px; }
  .toggle-sidebar-button { display: none; }
  .home-button { padding: 0; min-height: 44px; }
  .brand-name { display: none; }
  .header-search { min-width: 0; height: 44px; }
  .search-input { font-size: 16px; }
  .search-button { flex: 0 0 44px; padding: 0; }
  .clear-button { right: 44px; width: 44px; padding: 0; bottom: 0; }
  .suggestions-list li { min-height: 44px; box-sizing: border-box; overflow-wrap: anywhere; }
}

</style>
