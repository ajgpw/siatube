<template>
  <div class="history-container" :class="marginLeftClass">
    <div class="history-header">
      <h1>履歴</h1>
      <button
        v-if="videos.length > 0"
        class="clear-btn"
        @click="onClearHistory"
      >
        履歴をクリア
      </button>
    </div>

    <div v-if="loading" class="loading-msg">
      読み込み中...
    </div>

    <div v-else-if="videos.length === 0" class="empty-msg">
      視聴履歴がありません<br>プライベートモードの場合、正しく動作しない場合があります。
    </div>

    <div v-else class="video-list">
      <div
        v-for="video in videos"
        :key="video.id"
        class="video-item"
        @click="watchVideo(video.id)"
      >
        <div class="thumbnail-wrapper">
          <img
            :src="video.thumbnail || 'https://via.placeholder.com/320x180?text=No+Image'"
            :alt="video.title"
            class="thumbnail"
            @error="onImageError"
          />
        </div>

        <div class="video-info">
          <h3 class="video-title">{{ video.title }}</h3>
          <div class="meta-info">
            <span class="channel-name">{{ video.authorName }}</span>
            <span class="meta-separator">・</span>
            <span class="view-count">{{ video.views }}</span>
          </div>
          <p class="video-description">{{ video.description }}</p>
        </div>

        <button
          class="remove-btn"
          @click.stop="onRemoveVideo(video.id)"
          title="削除"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, inject } from 'vue';
import { useRouter } from 'vue-router';
import { getHistoryVideos, removeVideoFromHistory, clearHistory } from "@/services/storage/historyManager.js";

const router = useRouter();
const videos = ref([]);
const loading = ref(true);

// Sidebar state is not directly provided, so we'll use a fixed width with media queries
// But we can listen to window resize to dynamically adjust
const viewportWidth = ref(window.innerWidth);

const marginLeftClass = computed(() => {
  if (viewportWidth.value >= 1315) {
    return 'with-sidebar';
  } else if (viewportWidth.value >= 790) {
    return 'compact-mode';
  } else {
    return 'no-sidebar';
  }
});

const loadHistory = async () => {
  try {
    console.log('[HistoryView] Starting loadHistory...');
    loading.value = true;
    videos.value = await getHistoryVideos();
    console.log('[HistoryView] Loaded videos:', videos.value);
  } catch (error) {
    console.error('[HistoryView] Failed to load history:', error);
    console.error('[HistoryView] Error stack:', error.stack);
    videos.value = [];
  } finally {
    loading.value = false;
  }
};

const onRemoveVideo = async (videoId) => {
  try {
    await removeVideoFromHistory(videoId);
    videos.value = videos.value.filter(v => v.id !== videoId);
  } catch (error) {
    console.error('[HistoryView] Failed to remove video:', error);
  }
};

const onClearHistory = async () => {
  if (!confirm('本当に履歴をクリアしますか？')) {
    return;
  }
  try {
    await clearHistory();
    videos.value = [];
  } catch (error) {
    console.error('[HistoryView] Failed to clear history:', error);
  }
};

const watchVideo = (videoId) => {
  router.push({
    path: '/watch',
    query: { v: videoId }
  });
};

const onImageError = (event) => {
  event.target.src = 'https://via.placeholder.com/320x180?text=No+Image';
};

onMounted(() => {
  console.log('[HistoryView] Component mounted');
  loadHistory();

  // Handle window resize
  const handleResize = () => {
    viewportWidth.value = window.innerWidth;
  };
  window.addEventListener('resize', handleResize);

  return () => {
    window.removeEventListener('resize', handleResize);
  };
});
</script>

<script>
export default {
  name: 'HistoryView'
};
</script>

<style scoped>
.history-container {
  padding: 24px;
  transition: margin-left 0.3s ease;
}

.history-container.no-sidebar {
  margin-left: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

h1 {
  color: var(--text-primary);
  margin: 0;
  font-size: 2rem;
}

.clear-btn {
  padding: 8px 16px;
  background-color: var(--text-secondary);
  color: var(--on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease;
}

.clear-btn:hover {
  background-color: var(--text-secondary-hover, #999);
}

.loading-msg {
  color: var(--text-secondary);
  font-size: 1.1rem;
  padding: 24px;
  text-align: center;
}

.empty-msg {
  color: var(--text-secondary);
  font-size: 1.1rem;
  padding: 48px 24px;
  text-align: center;
}

.video-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.video-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  position: relative;
}

.video-item:hover {
  background-color: var(--hover-bg, #404040);
}

.video-title:hover {
  color: var(--link-hover);
  text-decoration: underline;
}

.thumbnail-wrapper {
  position: relative;
  width: 250px;
  height: 141px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
}

.thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 6px;
}

.video-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.video-title {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}

.meta-info {
  margin: 0 0 8px 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.channel-name {
  color: var(--text-secondary);
}

.meta-separator {
  color: var(--text-secondary);
}

.view-count {
  color: var(--text-secondary);
}

.video-description {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.remove-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  padding: 0;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
  opacity: 0;
}

.video-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background-color: rgba(255, 0, 0, 0.8);
}

@media (max-width: 1314px) {
  .history-container.with-sidebar {
    margin-left: 70px;
  }
}

@media (max-width: 640px) {
  .history-container {
    margin-left: 0;
    padding: 16px;
  }

  .history-header {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
  }

  h1 {
    font-size: 1.5rem;
  }

  .video-item {
    flex-direction: column;
  }

  .thumbnail-wrapper {
    width: 100%;
    max-width: 360px;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .remove-btn {
    opacity: 1;
  }
}

@media (max-width: 420px) {
  h1 {
    font-size: 1.3rem;
  }

  .clear-btn {
    padding: 6px 12px;
    font-size: 0.85rem;
  }

  .video-title {
    font-size: 0.95rem;
  }

  .thumbnail-wrapper {
    height: auto;
  }
}

</style>
