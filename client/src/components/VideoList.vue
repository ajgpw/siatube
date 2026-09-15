<template>
  <section>
    <h2 style="margin-inline-start: 7px; color: var(--text-primary);">{{ title }}</h2>
    <ul class="video-list">
      <li v-for="video in videos" :key="`${video.type}:${video.id}:${video.playlistId || ''}`" class="video-item">
        <!-- 動画 -->
        <template v-if="video.type !== 'channel'">
          <router-link :to="videoRoute(video)" class="thumbnail-link">
            <div
              class="thumbnail-wrapper"
              :data-duration="formatDuration(video.duration)"
            >
              <img
                :src="video.thumbnails?.medium?.url || video.thumbnails?.standard?.url || getPrimaryThumbnail(video.id)"
                :alt="video.title"
                @error="onImageError($event, video.id)"
              />

            </div>
          </router-link>

          <div class="info">
            <h3>
              <router-link
                :to="videoRoute(video)"
                class="title-link"
              >
                {{ video.title }}
              </router-link>
            </h3>
            <router-link
              :to="`/channel/${video.channelId}`"
              class="channel-link"
            >
              <div class="channel-info">
                <img 
                  :src="video.channelIcon"
                  :alt="video.channel + 'のアイコン'"
                  class="channel-icon"
                  @error="onChannelIconError"
                />
                {{ video.channel }}
              </div>
            </router-link>

            <p>
              {{ formatViewCount(video.viewCount) }}回視聴・
              {{ formatPublishedAt(video.publishedAt) }}
            </p>
          </div>
        </template>

        <!-- チャンネル -->
        <template v-else-if="video.type === 'channel'">
          <router-link :to="`/channel/${video.id}`" class="thumbnail-link">
            <div class="channel-thumbnail-wrapper">
              <img
                :src="video.channelIcon || video.icon"
                :alt="video.channel || video.name + 'のアイコン'"
                class="channel-icon-large"
                @error="onChannelIconError"
              />
            </div>
          </router-link>

          <div class="info">
            <h2 class="channel-name">
              <router-link :to="`/channel/${video.id}`" class="title-link">
                {{ video.channel || video.name }}
              </router-link>
            </h2>

            <p class="subscriber-count">
              登録者数: {{ video.subscriberCount }}
            </p>
          </div>
        </template>

      </li>
    </ul>
  </section>
</template>

<script>
import {
  formatDuration,
  formatPublishedAt,
  formatViewCount,
  getPrimaryThumbnail
} from "../utils/formatters";

export default {
  props: {
    videos: {
      type: Array,
      required: true,
    },
    title: {
      type: String,
      default: "動画リスト",
    },
  },
  methods: {
    formatDuration,
    formatPublishedAt,
    formatViewCount,
    getPrimaryThumbnail,
    videoRoute(video) {
      const query = { v: video.id };
      if (video.type === "playlist" && video.playlistId) {
        query.list = video.playlistId;
      }
      return { path: "/watch", query };
    },
    onImageError(event, id) {
      if (!event.target.dataset.error) {
        event.target.src = getPrimaryThumbnail(id);
        event.target.dataset.error = true;
      }
    },
    onChannelIconError(event) {
      event.target.style.display = "none";
    },
  },
};
</script>

<style scoped>
a,
.router-link,
.router-link-exact-active,
.channel-link,
.title-link,
.thumbnail-link {
  text-decoration: none;
}

html,
body {
  margin: 0;
  padding: 0;
  font-family: Meiryo, "メイリオ", sans-serif;
}

.title-link{
  color: var(--text-primary);
}

.video-list {
  list-style: none;
  padding: 10px;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.2rem;
}

.video-item {
  background: var(--bg-primary);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  max-width: 450px;
  border: 1px solid var(--border-color);
}

.video-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.thumbnail-wrapper {
  position: relative;
  width: 100%;
  padding-top: 56.25%; /* 16:9 */
  background-color: var(--bg-secondary);
}

.thumbnail-wrapper img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-wrapper::after {
  content: attr(data-duration);
  position: absolute;
  bottom: 6px;
  right: 6px;
  background-color: rgba(0, 0, 0, 0.75);
  color: white;
  font-size: 0.8rem;
  padding: 3px 6px;
  border-radius: 3px;
  font-weight: bold;
  pointer-events: none;
  line-height: 1.4;
}

.channel-thumbnail-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.2rem 0 0.5rem 0;
  background-color: transparent;
  padding-top: 40px;
}

.channel-icon-large {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.info {
  padding: 1rem;
}

.info h3 {
  font-size: 1.2rem;
  margin: 0 0 0.5rem;
  line-height: 1.4;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info h3 a,
.channel-info a {
  color: var(--text-primary);
  text-decoration: none;
  transition: color 0.2s ease;
}

.info h3 a:hover,
.channel-info a:hover {
  color: var(--link-hover);
  text-decoration: underline;
}

.info p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0.3rem 0;
  line-height: 1.4;
}

/* 動画用チャンネル情報 */
.channel-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
  color: var(--text-primary);
}

.channel-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.subscriber-count {
  font-weight: bold;
  color: var(--text-primary);
  margin-top: 0.4rem;
}
.channel-link .channel-info {
  text-decoration: none;
}

.channel-link:hover .channel-info {
  text-decoration: underline;
  color: var(--link-hover);
}

@media (max-width: 789px) {
  .video-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .video-item { max-width: none; min-width: 0; box-shadow: none; }
  .info { padding: 12px; }
  .info h3 { font-size: 1rem; }
}
@media (max-width: 539px) {
  .video-list { grid-template-columns: minmax(0, 1fr); padding: 8px; }
}
@media (hover: none) {
  .video-item:hover { transform: none; box-shadow: none; }
}

</style>
