<template>
  <article
    class="content-card"
    :class="[`layout-${layout}`, `kind-${item.type || 'video'}`]"
  >
    <template v-if="isPost">
      <header class="post-author">
        <img
          v-if="authorIcon"
          :src="authorIcon"
          class="author-avatar"
          alt=""
          loading="lazy"
          @error="hideBrokenImage"
        />
        <div v-else class="author-avatar author-placeholder" aria-hidden="true">
          {{ authorInitial }}
        </div>
        <div>
          <router-link
            v-if="item.authorId"
            :to="`/channel/${item.authorId}`"
            class="author-name"
          >
            {{ item.author || "チャンネル" }}
          </router-link>
          <strong v-else class="author-name">{{ item.author || "チャンネル" }}</strong>
          <span v-if="item.published" class="post-date">{{ item.published }}</span>
        </div>
      </header>

      <p
        v-if="postText"
        class="post-text"
        :class="{ expanded: postExpanded }"
      >{{ postText }}</p>
      <button
        v-if="postTextIsLong"
        type="button"
        class="post-expand-button"
        @click="postExpanded = !postExpanded"
      >{{ postExpanded ? "閉じる" : "もっと見る" }}</button>

      <div
        v-if="attachmentImages.length"
        class="post-gallery"
        :class="{ single: attachmentImages.length === 1 }"
      >
        <a
          v-for="(image, index) in attachmentImages"
          :key="`${image}-${index}`"
          :href="image"
          target="_blank"
          rel="noopener noreferrer"
          class="gallery-link"
        >
          <img
            :src="image"
            :alt="`投稿画像 ${index + 1}`"
            loading="lazy"
            @error="hideBrokenImage"
          />
        </a>
      </div>

      <router-link
        v-if="item.attachment?.videoId"
        :to="`/watch?v=${item.attachment.videoId}`"
        class="attachment-video"
      >
        <div class="attachment-play" aria-hidden="true">▶</div>
        <div>
          <span class="attachment-label">添付動画</span>
          <strong>{{ item.attachment.title || "動画を再生" }}</strong>
        </div>
      </router-link>

      <div v-if="pollChoices.length" class="poll" aria-label="投稿の投票項目">
        <div v-for="(choice, index) in pollChoices" :key="`${choice}-${index}`" class="poll-choice">
          <span>{{ choice }}</span>
        </div>
        <span v-if="item.attachment?.totalVotes" class="poll-votes">
          {{ item.attachment.totalVotes }}
        </span>
      </div>

      <footer class="post-footer">
        <div class="post-stats">
          <span v-if="item.voteCount">♡ {{ item.voteCount }}</span>
          <span v-if="item.commentCount">○ {{ item.commentCount }}</span>
        </div>
        <a
          v-if="item.url"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          class="external-link"
        >YouTubeで見る ↗</a>
      </footer>
    </template>

    <template v-else>
      <component :is="linkComponent" v-bind="linkAttributes" class="media-link">
        <div class="thumbnail-frame">
          <img
            v-if="primaryImage && !imageFailed"
            :src="primaryImage"
            :alt="item.title || 'コンテンツのサムネイル'"
            class="thumbnail"
            loading="lazy"
            @error="handleThumbnailError"
          />
          <div v-else class="thumbnail-placeholder" aria-hidden="true">
            <span>{{ isPlaylist ? "▤" : isShort ? "▶" : "▷" }}</span>
          </div>
          <div class="thumbnail-shade"></div>
          <span v-if="statusLabel" class="status-badge" :class="statusClass">
            {{ statusLabel }}
          </span>
          <span v-if="item.duration" class="duration">{{ item.duration }}</span>
          <span v-if="isPlaylist && item.videoCount" class="playlist-count">
            ▤ {{ item.videoCount }}
          </span>
        </div>
      </component>

      <div class="card-body">
        <div class="title-row">
          <component :is="linkComponent" v-bind="linkAttributes" class="card-title">
            {{ item.title || fallbackTitle }}
          </component>
        </div>

        <div v-if="item.author || authorIcon" class="author-line">
          <img
            v-if="authorIcon"
            :src="authorIcon"
            class="mini-avatar"
            alt=""
            loading="lazy"
            @error="hideBrokenImage"
          />
          <router-link v-if="item.authorId" :to="`/channel/${item.authorId}`">
            {{ item.author || "チャンネル" }}
          </router-link>
          <span v-else>{{ item.author }}</span>
        </div>

        <div v-if="primaryMeta.length" class="primary-meta">
          <span v-for="meta in primaryMeta" :key="meta">{{ meta }}</span>
        </div>

        <p v-if="item.description" class="description">{{ plainText(item.description) }}</p>

        <div v-if="displayBadges.length" class="badge-list">
          <span v-for="badge in displayBadges" :key="badge" class="metadata-badge">
            {{ badge }}
          </span>
        </div>

        <div v-if="metadataTokens.length" class="metadata-list">
          <span v-for="token in metadataTokens" :key="token">{{ token }}</span>
        </div>
      </div>
    </template>
  </article>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  playbackPlaylistId: {
    type: String,
    default: "",
  },
  layout: {
    type: String,
    default: "shelf",
  },
});

const imageFailed = ref(false);
const postExpanded = ref(false);

const isPost = computed(() => props.item.type === "post");
const isPlaylist = computed(() => props.item.type === "playlist");
const isShort = computed(() => props.item.type === "short");
const primaryImage = computed(
  () => props.item.thumbnail || props.item.thumbnailUrl || fallbackYoutubeThumbnail.value
);
const authorIcon = computed(() => props.item.icon || props.item.iconUrl || "");
const authorInitial = computed(() => (props.item.author || "C").trim().slice(0, 1).toUpperCase());
const fallbackYoutubeThumbnail = computed(() =>
  props.item.videoId ? `https://i.ytimg.com/vi/${props.item.videoId}/hqdefault.jpg` : ""
);

const internalPath = computed(() => {
  if (isPlaylist.value && props.item.playlistId) {
    return `/playlist?list=${encodeURIComponent(props.item.playlistId)}`;
  }
  if (props.item.videoId) {
    const videoPath = `/watch?v=${encodeURIComponent(props.item.videoId)}`;
    return props.playbackPlaylistId
      ? `${videoPath}&list=${encodeURIComponent(props.playbackPlaylistId)}`
      : videoPath;
  }
  return "";
});

const linkComponent = computed(() => {
  if (internalPath.value) return RouterLink;
  if (props.item.url) return "a";
  return "div";
});

const linkAttributes = computed(() => {
  if (internalPath.value) return { to: internalPath.value };
  if (props.item.url) {
    return { href: props.item.url, target: "_blank", rel: "noopener noreferrer" };
  }
  return {};
});

const fallbackTitle = computed(() => {
  if (isPlaylist.value) return "再生リスト";
  if (isShort.value) return "ショート";
  return "動画";
});

const statusLabel = computed(() => {
  if (props.item.isLive || props.item.streamStatus === "live") return "ライブ配信中";
  if (props.item.isUpcoming || props.item.streamStatus === "upcoming") return "配信予定";
  if (props.item.streamStatus === "ended") return "配信済み";
  return "";
});

const statusClass = computed(() => {
  if (props.item.isLive || props.item.streamStatus === "live") return "is-live";
  if (props.item.isUpcoming || props.item.streamStatus === "upcoming") return "is-upcoming";
  return "is-ended";
});

const primaryMeta = computed(() =>
  [props.item.viewCount, props.item.videoCount, props.item.published]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
);

const displayBadges = computed(() => {
  const duration = String(props.item.duration || "").trim();
  return (props.item.badges || [])
    .map((badge) => String(badge || "").trim())
    .filter(Boolean)
    .filter((badge) => badge !== duration)
    .filter((badge) => !/^\d{1,3}(?::\d{2}){1,2}$/.test(badge))
    .filter((badge) => !/^(?:video|動画|lockup_content_type_video)$/i.test(badge))
    .filter((badge, index, badges) => badges.indexOf(badge) === index);
});

const metadataTokens = computed(() => {
  const alreadyShown = new Set([
    ...primaryMeta.value,
    ...displayBadges.value,
    props.item.author,
    props.item.duration,
  ].filter(Boolean));
  return (props.item.metadataRows || [])
    .flat()
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .filter((value) => !alreadyShown.has(value));
});

const attachmentImages = computed(() => props.item.attachment?.images || []);
const pollChoices = computed(() => props.item.attachment?.choices || []);
const postText = computed(() => plainText(props.item.text));
const postTextIsLong = computed(
  () => postText.value.length > 180 || postText.value.split("\n").length > 4
);

function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function handleThumbnailError(event) {
  const element = event.currentTarget;
  const urlFallback = props.item.thumbnailUrl;
  const youtubeFallback = fallbackYoutubeThumbnail.value;

  if (urlFallback && element.src !== urlFallback && element.dataset.urlFallback !== "true") {
    element.dataset.urlFallback = "true";
    element.src = urlFallback;
    return;
  }
  if (youtubeFallback && element.src !== youtubeFallback && element.dataset.youtubeFallback !== "true") {
    element.dataset.youtubeFallback = "true";
    element.src = youtubeFallback;
    return;
  }
  imageFailed.value = true;
}

function hideBrokenImage(event) {
  event.currentTarget.style.display = "none";
}

watch(
  () => [props.item.thumbnail, props.item.thumbnailUrl, props.item.videoId, props.item.postId],
  () => {
    imageFailed.value = false;
    postExpanded.value = false;
  }
);
</script>

<style scoped>
.content-card {
  min-width: 0;
  color: var(--text-primary);
}

.layout-shelf {
  width: 280px;
  flex: 0 0 280px;
}

.layout-short {
  width: 210px;
  flex: 0 0 210px;
}

.layout-grid,
.layout-post {
  width: 100%;
}

.media-link,
.card-title,
.author-line a {
  color: inherit;
  text-decoration: none;
}

.thumbnail-frame {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 14px;
  background: var(--bg-secondary);
  isolation: isolate;
}

.layout-short .thumbnail-frame,
.kind-short .thumbnail-frame {
  aspect-ratio: 9 / 16;
}

.thumbnail,
.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  transition: transform 220ms ease;
}

.thumbnail-placeholder {
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  background: linear-gradient(145deg, var(--bg-secondary), var(--hover-bg));
  font-size: 2rem;
}

.content-card:hover .thumbnail {
  transform: scale(1.025);
}

.thumbnail-shade {
  position: absolute;
  inset: 45% 0 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(transparent, rgb(0 0 0 / 0.44));
}

.duration,
.playlist-count,
.status-badge {
  position: absolute;
  z-index: 2;
  padding: 4px 7px;
  border-radius: 6px;
  color: #fff;
  background: rgb(0 0 0 / 0.78);
  font-size: 0.74rem;
  font-weight: 700;
  line-height: 1;
}

.duration,
.playlist-count {
  right: 7px;
  bottom: 7px;
}

.status-badge {
  top: 7px;
  left: 7px;
}

.status-badge.is-live {
  background: #d11231;
}

.status-badge.is-upcoming {
  background: #1167c8;
}

.status-badge.is-ended {
  background: rgb(35 35 35 / 0.82);
}

.card-body {
  padding: 11px 2px 2px;
}

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.card-title {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  font-weight: 700;
  font-size: 0.98rem;
  line-height: 1.42;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.card-title:hover,
.author-line a:hover,
.external-link:hover {
  text-decoration: underline;
}

.author-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.mini-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
}

.primary-meta,
.metadata-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 0;
  margin-top: 7px;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.primary-meta span:not(:last-child)::after,
.metadata-list span:not(:last-child)::after {
  content: "・";
  margin: 0 3px;
}

.description {
  display: -webkit-box;
  overflow: hidden;
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.badge-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 9px;
}

.metadata-badge {
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  font-size: 0.68rem;
  font-weight: 700;
}

.metadata-list {
  margin-top: 7px;
  font-size: 0.72rem;
}

.kind-post {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: var(--bg-primary);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.04);
}

.post-author {
  display: flex;
  align-items: center;
  gap: 10px;
}

.author-avatar,
.author-placeholder {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 50%;
  object-fit: cover;
}

.author-placeholder {
  display: grid;
  place-items: center;
  color: var(--text-primary);
  background: var(--bg-secondary);
  font-weight: 800;
}

.author-name {
  display: block;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.91rem;
}

.post-date {
  display: block;
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.post-text {
  display: -webkit-box;
  overflow: hidden;
  margin: 12px 0 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.post-text.expanded {
  display: block;
  overflow: visible;
}

.post-expand-button {
  margin: -6px 0 11px;
  padding: 0;
  border: 0;
  cursor: pointer;
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 800;
}

.post-gallery {
  display: flex;
  gap: 4px;
  max-height: 220px;
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 12px;
  background: var(--bg-secondary);
  scrollbar-width: thin;
}

.post-gallery.single {
  display: block;
}

.gallery-link {
  height: 220px;
  flex: 0 0 min(78%, 340px);
  background: var(--bg-secondary);
}

.post-gallery.single .gallery-link {
  width: 100%;
  display: block;
}

.gallery-link img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.attachment-video {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 11px;
  padding: 10px;
  border-radius: 12px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  text-decoration: none;
}

.attachment-video strong,
.attachment-label {
  display: block;
}

.attachment-label {
  margin-bottom: 3px;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.attachment-play {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 50%;
  color: var(--on-accent);
  background: var(--accent-color);
}

.poll {
  display: grid;
  gap: 6px;
  margin-top: 11px;
}

.poll-choice {
  padding: 7px 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  text-align: center;
  font-size: 0.88rem;
}

.poll-votes {
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.post-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.post-stats {
  display: flex;
  gap: 14px;
  color: var(--text-secondary);
}

.external-link {
  color: var(--text-primary);
  text-decoration: none;
  font-weight: 700;
}

@media (max-width: 640px) {
  .layout-shelf {
    width: 78vw;
    flex-basis: 78vw;
  }

  .layout-short {
    width: 44vw;
    flex-basis: 44vw;
  }

  .kind-post {
    padding: 15px;
    border-radius: 14px;
  }
}
</style>
