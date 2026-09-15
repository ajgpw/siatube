<template>
  <div>
    <!-- カテゴリ切り替えボタン -->
    <nav class="category-nav">
      <button
        v-for="cat in categories"
        :key="cat.key"
        :class="{ active: selectedCategory === cat.key }"
        @click="selectedCategory = cat.key"
      >
        {{ cat.label }}
      </button>
    </nav>

    <main>
      <div v-if="loading" class="loading">読み込み中...</div>
      <div v-if="error" class="error">{{ error }}</div>

      <VideoList
        v-if="!loading && !error && selectedVideos.length"
        :videos="selectedVideos"
        :title="currentCategoryLabel"
      />
    </main>
    <footer class="footer">
      <p style="margin-block-start: 1px; color: var(--text-primary);">しあtube</p>
      <p style="color: var(--text-primary);">
        <a href="https://github.com/ajgpw/siatube" target="_blank" rel="noopener noreferrer">GitHub</a> |
        <a href="https://line.me/ti/g2/PT62G9W_N5WOkD7VECW3tftJlCn2KTJIVt6k7g" target="_blank" rel="noopener noreferrer">LINE</a> |
        <a href="https://www.chatwork.com/g/siatube" target="_blank" rel="noopener noreferrer">ChatWork</a>
      </p>
      <div class="Accesscount">
        表示回数
        <img src="https://count.getloli.com/@:siatube?name=%3Asiatube&theme=minecraft&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" style="width: 50%; max-width: 380px;">
      </div>
      <div style="color: var(--text-secondary);">バージョン2.1.8</div>
    </footer>
  </div>
</template>

<script>
import VideoList from "@/components/VideoList.vue";
import { search as searchSiaTube } from "@/services/siatubeApi";
import { normalizeSearchItems } from "@/utils/siatubeAdapters";

export default {
  components: { VideoList },
  data() {
    return {
      trend: {
        trending: [],
        music: [],
        gaming: [],
      },
      loading: false,
      error: null,
      selectedCategory: "trending",
      categories: [
        { key: "trending", label: "急上昇" },
        { key: "gaming", label: "ゲーム" },
        { key: "music", label: "音楽" },
      ],
    };
  },
  computed: {
    selectedVideos() {
      return this.trend[this.selectedCategory] || [];
    },
    currentCategoryLabel() {
      const found = this.categories.find(
        (c) => c.key === this.selectedCategory
      );
      return found ? found.label : "";
    },
  },
  created() {
    document.title = "しあチューブ - ホーム";
    this.fetchTrendData();
  },
  methods: {
    async fetchTrendData() {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch("https://raw.githubusercontent.com/ajgpw/youtubedata/refs/heads/main/trend-base64.json", {redirect: "follow",});
        if (!res.ok) throw new Error("データ取得失敗");
        const data = await res.json();
        this.trend = data;
      } catch (e) {
        this.error = e?.message || "データ取得失敗";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.Accesscount {
  font-size: 1rem;
  color: var(--text-primary);
}
.category-nav {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  justify-content: center;
  background-color: var(--bg-primary);
  transition: background-color 0.3s ease;
}
.category-nav button {
  padding: 0.5rem 1rem;
  border: none;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 4px;
  font-weight: bold;
  transition: background-color 0.3s ease, color 0.3s ease;
}
.category-nav button:hover {
  background-color: var(--hover-bg);
}
.category-nav button.active {
  background-color: var(--accent-color);
  color: var(--on-accent);
}
.error {
  color: var(--accent-weak);
  padding: 1rem;
}
.loading {
  padding: 1rem;
  text-align: center;
  color: var(--text-primary);
}
main {
  padding: 1rem;
  background-color: var(--bg-primary);
  transition: background-color 0.3s ease;
}
.footer {
  margin-top: 0px;
  padding: 1rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-secondary);
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}

.footer a {
  color: var(--accent-color);
  text-decoration: none;
  margin: 0 0.5rem;
  transition: color 0.2s ease;
}

.footer a:hover {
  text-decoration: underline;
}

@media (max-width: 789px) {
  main { padding: 0; }
  .category-nav { justify-content: flex-start; overflow-x: auto; gap: 8px; padding: 12px; }
  .category-nav button { flex-shrink: 0; min-height: 44px; }
}

</style>
