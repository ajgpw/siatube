<template>
  <section v-if="error" class="error-message" style="color: var(--text-primary);">
    {{ error }}
  </section>

  <section v-else-if="playlist" class="playlist-section" :class="`type-${displayType}`">
    <template v-if="displayType !== 'channel'">
      <h2 class="playlist-title" style="color: var(--text-primary);">
        {{ playlist.title }}
      </h2>
      <p class="playlist-meta" style="color: var(--text-primary);">
        動画本数: {{ playlist.totalItems }}
        <span
          class="views"
          v-if="displayType !== 'watch' && playlist.views"
        >
          ｜ {{ playlist.views }}
        </span>
      </p>
    </template>

    <div
      ref="scrollContainer"
      class="playlist-items-scroll"
      :class="`scroll-${displayType}`"
    >
      <div
        v-for="(item, idx) in playlist.items"
        :key="item.videoId || idx"
        class="playlist-item"
        :class="{ active: item.videoId === playVideoId }"
        :data-video-id="item.videoId"
      >
        <router-link
          :to="displayType !== 'channel'
            ? `/watch?v=${item.videoId}&list=${playbackPlaylistId}`
            : `/watch?v=${item.videoId}`"
          class="video-link"
        >
          <!-- watch レイアウト -->
          <div v-if="displayType === 'watch'" class="watch-layout">
            <div class="thumbnail-wrapper small-thumb">
              <img
                :src="item.thumbnail || getPrimaryThumbnail(item.videoId)"
                class="thumbnail"
                @error="onImageError($event, item.videoId)"
              />
              <span class="duration" v-if="item.duration">
                {{ item.duration }}
              </span>
            </div>

            <div class="text-content">
              <p class="title">{{ item.title }}</p>
              <p class="author">{{ item.author }}</p>

              <p class="meta-info" v-if="item.views || item.published">
                <span v-if="item.views">
                  <template v-if="isNumericOnly(item.views)">
                    {{ item.views }}人が待機中
                  </template>
                  <template v-else>
                    {{ item.views }}
                  </template>
                </span>
                <span v-if="item.views && item.published"> • </span>
                <span v-if="item.published">{{ item.published }}</span>
              </p>
            </div>
          </div>

          <!-- 通常レイアウト -->
          <div v-else>
            <div class="thumbnail-wrapper">
              <img
                :src="item.thumbnail || getPrimaryThumbnail(item.videoId)"
                class="thumbnail"
                @error="onImageError($event, item.videoId)"
              />
              <span class="duration" v-if="item.duration">
                {{ item.duration }}
              </span>
            </div>

            <p class="title">{{ item.title }}</p>
            <p class="author">{{ item.author }}</p>

            <p class="meta-info" v-if="item.views || item.published">
              <span v-if="item.views">
                <template v-if="isNumericOnly(item.views)">
                  {{ item.views }}人が待機中
                </template>
                <template v-else>
                  {{ item.views }}
                </template>
              </span>
              <span v-if="item.views && item.published"> • </span>
              <span v-if="item.published">{{ item.published }}</span>
            </p>
          </div>
        </router-link>
      </div>
      <div v-if="nextToken" class="playlist-more">
        <button type="button" class="load-more-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "さらに読み込み中…" : "動画をさらに表示" }}
        </button>
      </div>
    </div>
  </section>

  <section v-else>
    <p style="color: var(--text-primary);">プレイリストを読み込み中...</p>
  </section>
</template>

<script setup>
import { ref, nextTick, computed, watch } from "vue";
import { useRoute } from "vue-router";
import { playlist as fetchPlaylist } from "@/services/api/siatubeApi.js";
import { getPlaylistById } from "@/services/storage/playlistManager.js";
import { normalizePlaylist } from "@/services/api/siatubeAdapters.js";
import { arrayBufferToDataUrl } from "@/utils/imageEncoding.js";

const props = defineProps({
  playlistId: String,
  playVideoId: String,
  displayType: {
    type: String,
    default: "default",
  },
});
const emit = defineEmits(["next-video"]);

const route = useRoute();

const playlist = ref(null);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
const scrollContainer = ref(null);
const nextToken = ref(null);
let requestSequence = 0;

const playlistId = computed(() => props.playlistId || route.query.list || "");
const playVideoId = computed(() => props.playVideoId || route.query.play || route.query.v || "");
const displayType = computed(() => props.displayType || route.query.type || "default");
const playbackPlaylistId = computed(
  () => playlist.value?.requestedPlaylistId || playlistId.value
);

function isNumericOnly(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return true;
  if (typeof value !== "string") return false;
  return /^[0-9]+$/.test(value);
}

function emitNextVideo() {
  const items = playlist.value?.items || [];
  const currentIndex = items.findIndex(
    (item) => item.videoId === playVideoId.value
  );
  emit(
    "next-video",
    currentIndex >= 0 ? items[currentIndex + 1]?.videoId || "" : ""
  );
}

async function localPlaylistData(id) {
  const localId = id.slice("local-".length);
  if (!/^\d+$/.test(localId)) throw new Error("Invalid local playlist ID");
  const custom = await getPlaylistById(Number(localId));
  if (!custom) throw new Error("プレイリストが見つかりません");
  return {
    title: custom.name,
    playlistId: id,
    requestedPlaylistId: id,
    totalItems: custom.items.length,
    items: custom.items.map((item) => ({
      videoId: item.id,
      title: item.title,
      author: item.authorName,
      thumbnail: arrayBufferToDataUrl(item.thumbnailBinary),
      duration: null,
      views: item.views || null,
      published: item.published || null,
    })),
    nextToken: null,
    isCustom: true,
  };
}

async function scrollToCurrentVideo() {
  await nextTick();
  if (playVideoId.value && scrollContainer.value) {
    const target = scrollContainer.value.querySelector(
      `.playlist-item[data-video-id="${playVideoId.value}"]`
    );
    if (target) {
      scrollContainer.value.scrollTo({
        top:
          target.offsetTop -
          scrollContainer.value.clientHeight / 2 +
          target.clientHeight / 2,
        behavior: "smooth",
      });
    }
  }
}

async function loadPlaylist({ append = false } = {}) {
  if (!playlistId.value) {
    console.error("playlistId が指定されていません");
    error.value = "プレイリストIDが指定されていません。";
    return;
  }

  const sequence = append ? requestSequence : ++requestSequence;
  if (append) loadingMore.value = true;
  else {
    loadingMore.value = false;
    loading.value = true;
    playlist.value = null;
    nextToken.value = null;
  }
  error.value = "";

  try {
    let data;
    if (playlistId.value && playlistId.value.startsWith("local-")) {
      data = await localPlaylistData(playlistId.value);
    } else {
      data = await fetchPlaylist(playlistId.value, {
        token: append ? nextToken.value : undefined,
        v: route.query.v || undefined,
        retries: 1,
        timeout: 30000,
      });
    }
    if (sequence !== requestSequence) return;

    const normalized = normalizePlaylist(data, playlistId.value);
    if (append && playlist.value) {
      const seen = new Set(playlist.value.items.map((item) => item.videoId));
      playlist.value.items.push(
        ...normalized.items.filter((item) => !seen.has(item.videoId))
      );
      playlist.value.responseItems = String(playlist.value.items.length);
      playlist.value.nextToken = normalized.nextToken;
    } else {
      playlist.value = normalized;
    }
    nextToken.value = normalized?.nextToken || null;
    emitNextVideo();
    if (!append) await scrollToCurrentVideo();
  } catch (err) {
    if (sequence !== requestSequence) return;
    console.error("プレイリスト取得失敗:", err);
    if (!append) {
      error.value = err?.connectionFailure
        ? err.message
        : "プレイリストの取得に失敗しました。";
    }
  } finally {
    if (sequence === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function loadMore() {
  if (!nextToken.value || loadingMore.value) return;
  loadPlaylist({ append: true });
}

watch(playlistId, () => loadPlaylist(), { immediate: true });

watch(playVideoId, (newVideoId, oldVideoId) => {
  if (newVideoId && newVideoId !== oldVideoId) {
    emitNextVideo();
    scrollToCurrentVideo();
  }
});

function getPrimaryThumbnail(id) {
  return `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
}

function onImageError(event, id) {
  if (!event.target.dataset.error) {
    event.target.src = `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
    event.target.dataset.error = "true";
  }
}
</script>

<style scoped>
.playlist-item.active {
  background-color: var(--hover-bg);
  transition: background-color 0.2s ease;
}

.playlist-section {
  max-width: 100%;
  margin: 0 auto;
  padding: 0.9rem;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
}

.playlist-more {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
}

.scroll-default .playlist-more,
.scroll-channel .playlist-more {
  grid-column: 1 / -1;
}

.scroll-watch .playlist-more {
  flex: 0 0 auto;
}

.load-more-btn {
  border: 1px solid var(--border-color);
  border-radius: 18px;
  padding: 8px 16px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  cursor: pointer;
}

.load-more-btn:disabled {
  cursor: wait;
  opacity: 0.7;
}

.type-watch {
  background-color: transparent;
  border: 1px solid var(--border-color); 
  border-radius: 8px;
  padding: 0.9rem;
  max-width: 360px;
}

.playlist-title {
  font-size: 1.4rem;
  margin-bottom: 0.2rem;
  margin-block-start:0.3em;
  color: var(--text-primary);
}

.playlist-meta {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.scroll-default,
.scroll-channel {
  display: grid;
  grid-template-columns: repeat(auto-fill, 210px);
  justify-content: center;
  gap: 12px;
  padding-bottom: 1rem;
}

.scroll-watch {
  padding-top: 3em;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: 420px;
  padding-right: 6px;
}

.playlist-item {
  width: 210px;
  flex-shrink: 0;
}

.type-watch .playlist-item {
  width: 100%;
}

.video-link {
  text-decoration: none;
  color: inherit;
  display: block;
}

.thumbnail-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 0.5rem;
  margin-block: 10px;
  background-color: var(--bg-secondary);
}

.thumbnail-wrapper.small-thumb {
  width: 160px;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duration {
  position: absolute;
  bottom: 4px;
  right: 4px;
  font-size: 0.75rem;
  color: var(--on-accent);
  background-color: rgba(0, 0, 0, 0.7);
  padding: 2px 5px;
  border-radius: 4px;
}

.title {
  margin-block-end: 3px;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: left;
  margin-top: 1;
  line-height: 1.3;
  max-height: calc(1.3em * 2); 
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  text-overflow: ellipsis;
  white-space: normal;
  margin-left: 2px;
  color: var(--text-primary);
}

.author {
  margin-block-start: 3px;
  margin-block-end: 3px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 2px;
}

.meta-info {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 2px;
  margin-top: 2px;
}

.watch-layout {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.text-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 1;
}

@media (max-width: 600px) {
  .playlist-item {
    width: 100%;
  }
}

.error-message {
  color: var(--accent-weak);
  padding: 1rem;
  text-align: center;
}
</style>
