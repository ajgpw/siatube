<template>
  <div>
    <!-- 通常読み込み中 -->
    <div v-if="loading || retrying" class="loading">
      {{ retrying ? "再読み込み中…" : "読み込み中…" }}
    </div>

    <!-- エラー表示 -->
    <div v-if="error" class="error">
      {{ error }}
      <button @click="retry" class="retry-btn" :disabled="retrying">
        {{ retrying ? "再読み込み中…" : "再試行" }}
      </button>
    </div>

    <!-- 成功時の動画リスト -->
    <VideoList
      v-if="!loading && !error && videos.length"
      :videos="videos"
      :title="`検索結果: ${query}`"
    />

    <!-- 検索結果なし -->
    <div v-if="!loading && !error && videos.length === 0" class="no-results">
      検索結果が見つかりませんでした。
    </div>

    <div v-if="!loading && !error && videos.length" class="load-more-row">
      <div>
        <button
          v-if="continuationToken"
          type="button"
          class="retry-btn"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? "さらに読み込み中…" : "検索結果をさらに表示" }}
        </button>
        <p v-if="loadMoreError" class="error">{{ loadMoreError }}</p>
      </div>
    </div>
  </div>
</template>

<script>
import VideoList from "@/components/video/VideoList.vue";
import { search as searchSiaTube } from "@/services/api/siatubeApi.js";
import { normalizeSearchItems } from "@/services/api/siatubeAdapters.js";

export default {
  components: { VideoList },
  props: {
    query: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      videos: [],
      loading: false,
      error: null,
      lastQuery: "",
      retrying: false,
      loadingMore: false,
      continuationToken: null,
      loadMoreError: null,
      searchSequence: 0,
    };
  },
  watch: {
    query: {
      immediate: true,
      handler(newQuery) {
        document.title = newQuery ? `${newQuery} - 検索` : "検索結果";
        if (newQuery) {
          this.lastQuery = newQuery;
          this.fetchSearchResults(newQuery);
        } else {
          this.searchSequence += 1;
          this.videos = [];
          this.continuationToken = null;
          this.loading = false;
          this.loadingMore = false;
          this.retrying = false;
          this.error = null;
          this.loadMoreError = null;
        }
      },
    },
  },
  methods: {
    async fetchSearchResults(q, { append = false, token = null } = {}) {
      const sequence = append ? this.searchSequence : ++this.searchSequence;
      // 通常の検索呼び出しか再試行かでフラグ設定
      if (append) this.loadingMore = true;
      else if (!this.retrying) this.loading = true;
      if (append) this.loadMoreError = null;
      else this.error = null;
      if (!append) {
        this.loadMoreError = null;
        this.videos = [];
        this.continuationToken = null;
      }

      try {
        const data = await searchSiaTube({ query: token ? "" : q, token });
        if (sequence !== this.searchSequence) return;

        const incoming = normalizeSearchItems(data?.items);
        if (append) {
          const seen = new Set(
            this.videos.map((item) => `${item.type}:${item.id}:${item.playlistId || ""}`)
          );
          this.videos.push(
            ...incoming.filter((item) => {
              const key = `${item.type}:${item.id}:${item.playlistId || ""}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
          );
        } else {
          this.videos = incoming;
        }
        this.continuationToken = data?.continuationToken || null;
      } catch (e) {
        console.warn("fetchSearchResults error:", e);
        if (sequence === this.searchSequence) {
          if (append) {
            this.loadMoreError = e?.connectionFailure
              ? e.message
              : "検索結果の追加取得に失敗しました";
          } else {
            this.error = e?.connectionFailure
              ? e.message
              : "検索APIの取得に失敗しました";
          }
          if (!append) this.videos = [];
        }
      } finally {
        if (sequence === this.searchSequence) {
          this.loading = false;
          this.loadingMore = false;
          this.retrying = false;
        }
      }
    },
    loadMore() {
      if (!this.continuationToken || this.loadingMore) return;
      this.fetchSearchResults(this.lastQuery, {
        append: true,
        token: this.continuationToken,
      });
    },
    retry() {
      if (!this.lastQuery) return;
      this.retrying = true;
      this.fetchSearchResults(this.lastQuery);
    },
  },
};
</script>

<style scoped>
.loading {
  padding: 1rem;
  text-align: center;
  font-weight: bold;
  color: var(--text-primary);
  background-color: var(--bg-primary);
}

.error {
  color: var(--accent-weak);
  padding: 1rem;
  text-align: center;
}

.retry-btn {
  margin-left: 1rem;
  padding: 0.3rem 0.8rem;
  background-color: var(--accent-color);
  color: var(--on-accent);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.retry-btn:disabled {
  background-color: var(--border-color);
  cursor: not-allowed;
  color: var(--text-secondary);
}

.retry-btn:hover:not(:disabled) {
  background-color: var(--accent-dark);
  color: var(--on-accent);
}

.no-results {
  padding: 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.load-more-row {
  display: flex;
  justify-content: center;
  padding: 0 1rem 1.5rem;
}
</style>
