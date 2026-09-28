<template>
  <aside v-if="playlistId || relatedVideos.length" class="related-section">
    <PlaylistComponent
      v-if="playlistId"
      displayType="watch"
      :playlistId="playlistId"
      :playVideoId="currentVideoId"
      @next-video="$emit('playlist-next-video', $event)"
    />
    <template v-if="relatedVideos.length">
      <h3 class="related-title">関連動画</h3>
      <ul class="related-list">
        <li v-for="(r, index) in relatedVideos" :key="`${r.type}:${r.videoId}:${r.replaylistId || ''}`" :ref="(el) => { if (index === relatedVideos.length - 1) lastItem = el; }" class="related-item" :data-video-id="r.videoId">
          <router-link v-if="r.videoId" :to="rLink(r)" class="page-link">
            <div class="thumb-wrapper">
              <img :src="r.base64imge" :alt="r.title" class="thumb-img" />
              <span v-if="r.duration" class="duration-badge" :class="{ 'badge-live': r.badge && r.badge.toLowerCase().includes('ライブ') }">{{ r.duration }}</span>
            </div>
          </router-link>
          <router-link v-if="r.videoId" :to="rLink(r)" class="page-link">
            <div class="video-info">
              <span class="video-title-related" :title="r.title">{{ r.title }}</span>
              <div class="video-metadata">
                <div style="display: flex; align-items: center;" class="one-line re-actername">{{ r.metadataRow1 }}<svg v-if="r.verifiedIcon === 'CHECK_CIRCLE_FILLED'" xmlns="http://www.w3.org/2000/svg" height="12" viewBox="0 0 12 12" width="12" focusable="false" aria-hidden="true" style="padding-left: 5px; pointer-events: none; display: inherit;"><path fill="#888" d="M6 0.5C2.962 0.5 0.5 2.962 0.5 6s2.462 5.5 5.5 5.5 5.5 -2.462 5.5 -5.5S9.037 0.5 6 0.5m2.853 3.647a0.5 0.5 0 0 1 0 0.707L5 8.707l-1.853 -1.853a0.5 0.5 0 1 1 0.707 -0.707L5 7.293l3.147 -3.147a0.5 0.5 0 0 1 0.707 0"/></svg></div>
                <span v-if="r.metadataRow2Part1 && r.metadataRow2Part1.replace(/\s+/g, '') !== '本日更新'">{{ r.metadataRow2Part1.replace(/\s+/g, '') === '再生リストの全体を見る' ? '再生リスト' : r.metadataRow2Part1.replace(/\s+/g, '') }}</span>
                <span v-if="r.metadataRow2Part2 && r.metadataRow2Part2.replace(/\s+/g, '')" class="dot">・</span>{{ r.metadataRow2Part2 ? r.metadataRow2Part2.replace(/\s+/g, '') : '' }}
              </div>
              <span v-if="r.badge && r.badge !== null" class="badge-display">{{ r.badge }}</span>
            </div>
          </router-link>
        </li>
      </ul>
    </template>
    <p v-if="loadingMore" class="loading-more">関連動画をさらに取得中...</p>
  </aside>
</template>

<script>
import PlaylistComponent from '@/components/playlist/Playlist.vue';

export default {
  name: 'RelatedList',
  components: { PlaylistComponent },
  props: {
    relatedVideos: { type: Array, default: () => [] },
    playlistId: { type: [String, null], default: null },
    currentVideoId: { type: String, default: '' },
    loadingMore: { type: Boolean, default: false },
  },
  data() {
    return {
      lastItem: null,
      observer: null,
    };
  },
  mounted() {
    this.observeLastItem();
  },
  beforeUnmount() {
    if (this.observer) {
      this.observer.disconnect();
    }
  },
  watch: {
    relatedVideos() {
      this.$nextTick(() => {
        this.observeLastItem();
      });
    },
  },
  methods: {
    rLink(r) {
      // If the related item itself is a playlist, link to that playlist
      if (r.type === "playlist") {
        return `/watch?v=${r.videoId}&list=${r.replaylistId}`;
      }

      // Only preserve current `list` param when the related video is part
      // of the same playlist (i.e. r.replaylistId equals current playlistId).
      if (r.replaylistId && this.playlistId && r.replaylistId === this.playlistId) {
        return `/watch?v=${r.videoId}&list=${this.playlistId}`;
      }

      // Otherwise navigate to the video without carrying over the list param.
      return `/watch?v=${r.videoId}`;
    },
    observeLastItem() {
      if (this.observer) {
        this.observer.disconnect();
      }
      if (this.lastItem) {
        this.observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
            this.$emit('load-more');
          }
        });
        this.observer.observe(this.lastItem);
      }
    },
  },
};
</script>

<style scoped>
.related-section {
  width: 360px;
  flex-shrink: 0;
}

.related-title {
  font-size: 1.4rem;
  font-weight: 500;
  margin-bottom: 12px;
}

.related-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.related-item {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  cursor: pointer;
}

.thumb-wrapper {
  position: relative;
  width: 168px;
  height: 94.5px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 4px;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

.duration-badge {
  line-height: 1.3;
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--on-accent);
  padding: 2px 4px;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 2px;
  pointer-events: none;
  user-select: none;
  z-index: 10;
}
.badge-live { background: var(--danger); }

.badge-display {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary);
  display: block;
}

.loading-more {
  text-align: center;
  padding: 12px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.video-info { flex: 1; }

.video-title-related {
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.3;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.video-metadata {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.one-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 180px;
}

.re-actername{
  margin-bottom: 0px;
  font-size: 0.8rem;
}

.page-link { text-decoration: none; }

.dot { margin: 0 4px; }

@media (max-width: 999px) {
  .related-section { width: 100%; margin-top: 32px; }
  .related-item { gap: 10px; }
  .thumb-wrapper { width: 140px; height: 78.75px; }
  .video-title-related { font-size: 0.9rem; }
  .video-metadata { font-size: 0.8rem; }
  .duration-badge { font-size: 0.65rem; padding: 1px 2px; }
}
</style>
