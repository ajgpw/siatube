<template>
  <main class="channel-page">
    <section v-if="loadingChannel" class="channel-shell loading-shell" aria-busy="true">
      <div class="skeleton banner-skeleton"></div>
      <div class="loading-identity">
        <div class="skeleton avatar-skeleton"></div>
        <div class="loading-copy">
          <div class="skeleton line line-title"></div>
          <div class="skeleton line line-meta"></div>
          <div class="skeleton line line-description"></div>
        </div>
      </div>
      <div class="skeleton tabs-skeleton"></div>
      <div class="loading-grid">
        <div v-for="index in 8" :key="index" class="loading-card">
          <div class="skeleton loading-thumbnail"></div>
          <div class="skeleton line"></div>
          <div class="skeleton line line-short"></div>
        </div>
      </div>
    </section>

    <section v-else-if="errorMessage || !channel" class="error-state">
      <div class="error-mark" aria-hidden="true">!</div>
      <h1>チャンネルを読み込めませんでした</h1>
      <p>{{ errorMessage || "チャンネル情報を取得できませんでした。" }}</p>
      <button type="button" class="primary-button" @click="reloadChannel">もう一度試す</button>
    </section>

    <template v-else>
      <header class="channel-hero">
        <div class="banner" :class="{ 'has-image': channel.banner && !bannerFailed }">
          <img
            v-if="channel.banner && !bannerFailed"
            :src="channel.banner"
            alt=""
            class="banner-image"
            @error="bannerFailed = true"
          />
          <div class="banner-pattern" aria-hidden="true"></div>
        </div>

        <div class="hero-content channel-shell">
          <div class="channel-avatar-wrap">
            <img
              v-if="channel.avatar && !avatarFailed"
              :src="channel.avatar"
              :alt="`${channel.title}のチャンネルアイコン`"
              class="channel-avatar"
              @error="avatarFailed = true"
            />
            <div v-else class="channel-avatar avatar-fallback" aria-hidden="true">
              {{ channelInitial }}
            </div>
          </div>

          <div class="identity">
            <div class="title-line">
              <div>
                <h1>{{ channel.title }}</h1>
              </div>
              <div class="hero-actions">
                <button
                  type="button"
                  class="subscribe-button"
                  :class="{ subscribed }"
                  :aria-pressed="subscribed"
                  @click="toggleSubscribeOnChannel"
                >
                  <span aria-hidden="true">{{ subscribed ? "✓" : "+" }}</span>
                  {{ subscribed ? "登録済み" : "チャンネル登録" }}
                </button>
                <a
                  :href="youtubeChannelUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="secondary-button"
                >YouTube ↗</a>
              </div>
            </div>

            <div class="channel-meta">
              <span v-if="channel.videoCount" class="important-meta">{{ channel.videoCount }}</span>
              <span v-if="channel.channelId">ID:{{ channel.channelId }}</span>
            </div>

            <div v-if="descriptionText" class="hero-description-wrap">
              <p class="hero-description" :class="{ expanded: descriptionExpanded }">
                {{ descriptionText }}
              </p>
              <button
                v-if="descriptionIsLong"
                type="button"
                class="text-button"
                @click="descriptionExpanded = !descriptionExpanded"
              >
                {{ descriptionExpanded ? "閉じる" : "もっと見る" }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav class="channel-nav" aria-label="チャンネル内メニュー">
        <div class="channel-shell tab-strip" role="tablist">
          <button
            v-for="item in tabs"
            :key="item.id"
            type="button"
            role="tab"
            :aria-selected="tab === item.id"
            :class="{ active: tab === item.id }"
            @click="tab = item.id"
          >
            {{ item.label }}
            <span v-if="item.count !== null" class="tab-count">{{ item.count }}</span>
          </button>
        </div>
      </nav>

      <div class="channel-shell page-content">
        <template v-if="tab === 'home'">
          <section v-if="topVideo?.videoId" class="featured-section">
            <div class="section-kicker">FEATURED</div>
            <router-link :to="`/watch?v=${topVideo.videoId}`" class="featured-card">
              <div class="featured-media">
                <img
                  v-if="featureImage && !featureImageFailed"
                  :src="featureImage"
                  :alt="topVideo.title"
                  @error="handleFeatureImageError"
                />
                <div v-else class="feature-placeholder" aria-hidden="true">▶</div>
                <div class="feature-overlay"></div>
                <span class="feature-play" aria-hidden="true">▶</span>
                <span v-if="topVideo.duration" class="feature-duration">
                  {{ topVideo.duration }}
                </span>
              </div>
              <div class="featured-copy">
                <div v-if="topVideoStatus" class="feature-status">{{ topVideoStatus }}</div>
                <h2>{{ topVideo.title || "注目の動画" }}</h2>
                <div v-if="topVideoMeta.length" class="feature-meta">
                  <span v-for="meta in topVideoMeta" :key="meta">{{ meta }}</span>
                </div>
                <p v-if="topVideo.description">{{ plainText(topVideo.description) }}</p>
                <div v-if="topVideo.badges?.length" class="feature-badges">
                  <span v-for="badge in topVideo.badges" :key="badge">{{ badge }}</span>
                </div>
                <strong class="watch-action">今すぐ見る <span>→</span></strong>
              </div>
            </router-link>
          </section>
          <section
            v-for="(section, sectionIndex) in displayedHomeSections"
            :key="sectionKey(section, sectionIndex)"
            class="channel-section"
          >
            <div class="section-heading">
              <div class="heading-main">
                <router-link
                  v-if="section.playlistId"
                  :to="`/playlist?list=${encodeURIComponent(section.playlistId)}`"
                  class="section-icon section-icon-link"
                  :aria-label="`${section.title}をすべて再生`"
                  title="すべて再生"
                >{{ sectionIcon(section.type) }}</router-link>
                <span v-else class="section-icon" aria-hidden="true">{{ sectionIcon(section.type) }}</span>
                <div>
                  <h2>{{ section.title }}</h2>
                  <p>{{ section.items.length }}件 · {{ sectionTypeLabel(section.type) }}</p>
                </div>
              </div>
              <router-link
                v-if="section.playlistId"
                :to="`/playlist?list=${encodeURIComponent(section.playlistId)}`"
                class="section-link"
              >
                すべて再生 →
              </router-link>
            </div>

            <div class="section-track-shell" :class="section.type">
              <button
                v-if="sectionCanScrollLeft(sectionKey(section, sectionIndex))"
                type="button"
                class="section-scroll-button scroll-left"
                :aria-label="`${section.title}を左にスクロール`"
                @click="scrollSection(sectionKey(section, sectionIndex), -1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m14.5 5-7 7 7 7" />
                </svg>
              </button>

              <div
                :ref="(element) => setSectionTrackRef(sectionKey(section, sectionIndex), element)"
                class="section-track"
                :class="section.type"
                @scroll.passive="updateSectionScrollState(sectionKey(section, sectionIndex))"
              >
                <ChannelContentCard
                  v-for="(item, itemIndex) in section.items"
                  :key="itemKey(item, itemIndex)"
                  :item="item"
                  :layout="sectionCardLayout(section)"
                  :playback-playlist-id="section.playlistId || ''"
                />
              </div>

              <button
                v-if="sectionCanScrollRight(sectionKey(section, sectionIndex))"
                type="button"
                class="section-scroll-button scroll-right"
                :aria-label="`${section.title}を右にスクロール`"
                @click="scrollSection(sectionKey(section, sectionIndex), 1)"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9.5 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          </section>

          <section v-if="!displayedHomeSections.length && !topVideo?.videoId" class="empty-state">
            <span aria-hidden="true">□</span>
            <h2>ホームコンテンツがありません</h2>
            <p>「動画」タブからアップロード一覧を確認できます。</p>
          </section>
        </template>

        <template v-else-if="tab === 'videos'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">VIDEOS</span>
              <h2>動画</h2>
              <p>ホームで取得できた詳細情報と、アップロード一覧をまとめて表示します。</p>
            </div>
          </div>

          <section v-if="regularVideoItems.length" class="content-grid video-grid">
            <ChannelContentCard
              v-for="(item, index) in regularVideoItems"
              :key="itemKey(item, index)"
              :item="item"
              layout="grid"
            />
          </section>

          <section v-if="channel.uploadsPlaylistId" class="all-uploads">
            <div class="subsection-heading">
              <h3>すべてのアップロード</h3>
              <router-link :to="`/playlist?list=${encodeURIComponent(channel.uploadsPlaylistId)}`">
                再生リストで開く →
              </router-link>
            </div>
            <VideoList :playlist-id="channel.uploadsPlaylistId" displayType="channel" />
          </section>

          <section v-if="!regularVideoItems.length && !channel.uploadsPlaylistId" class="empty-state">
            <h2>動画が見つかりませんでした</h2>
          </section>
        </template>

        <template v-else-if="tab === 'shorts'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">SHORTS</span>
              <h2>ショート</h2>
              <p>{{ shortItems.length }}件のコンテンツ</p>
            </div>
          </div>
          <section class="content-grid shorts-grid">
            <ChannelContentCard
              v-for="(item, index) in shortItems"
              :key="itemKey(item, index)"
              :item="item"
              layout="short"
            />
          </section>
        </template>

        <template v-else-if="tab === 'live'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">LIVE</span>
              <h2>ライブ・配信</h2>
              <p>{{ liveItems.length }}件のコンテンツ</p>
            </div>
          </div>
          <section class="content-grid video-grid">
            <ChannelContentCard
              v-for="(item, index) in liveItems"
              :key="itemKey(item, index)"
              :item="item"
              layout="grid"
            />
          </section>
        </template>

        <template v-else-if="tab === 'posts'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">COMMUNITY</span>
              <h2>投稿</h2>
              <p>{{ postItems.length }}件のコンテンツ</p>
            </div>
          </div>
          <section class="posts-grid">
            <ChannelContentCard
              v-for="(item, index) in postItems"
              :key="itemKey(item, index)"
              :item="item"
              layout="post"
            />
          </section>
        </template>

        <template v-else-if="tab === 'playlists'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">COLLECTIONS</span>
              <h2>再生リスト</h2>
              <p>{{ playlistItems.length || playlistShelves.length }}件のコンテンツ</p>
            </div>
          </div>
          <section v-if="playlistItems.length" class="content-grid video-grid">
            <ChannelContentCard
              v-for="(item, index) in playlistItems"
              :key="itemKey(item, index)"
              :item="item"
              layout="grid"
            />
          </section>

          <section v-if="playlistShelves.length" class="playlist-directory">
            <h3>ホームの再生セクション</h3>
            <router-link
              v-for="(section, index) in playlistShelves"
              :key="sectionKey(section, index)"
              :to="`/playlist?list=${encodeURIComponent(section.playlistId)}`"
              class="directory-row"
            >
              <span class="directory-icon" aria-hidden="true">▤</span>
              <span>
                <strong>{{ section.title }}</strong>
                <small>{{ section.items.length }}件</small>
              </span>
              <span class="directory-arrow">→</span>
            </router-link>
          </section>
        </template>

        <template v-else-if="tab === 'about'">
          <div class="page-heading">
            <div>
              <span class="section-kicker">ABOUT</span>
              <h2>チャンネル概要</h2>
            </div>
          </div>

          <div class="about-layout">
            <section class="about-card description-card">
              <h3>説明</h3>
              <p v-if="descriptionText">{{ descriptionText }}</p>
              <p v-else class="muted">説明はありません。</p>
            </section>

            <aside class="about-card details-card">
              <h3>詳細</h3>
              <dl>
                <div v-if="channel.videoCount">
                  <dt>チャンネル情報</dt>
                  <dd>{{ channel.videoCount }}</dd>
                </div>
                <div>
                  <dt>チャンネルID</dt>
                  <dd><code>{{ channel.channelId || effectiveId }}</code></dd>
                </div>
                <div v-if="channel.uploadsPlaylistId">
                  <dt>アップロードID</dt>
                  <dd><code>{{ channel.uploadsPlaylistId }}</code></dd>
                </div>
                <div>
                  <dt>ホームセクション</dt>
                  <dd>{{ homeSections.length }}</dd>
                </div>
                <div>
                  <dt>取得コンテンツ</dt>
                  <dd>{{ homeItemCount }}</dd>
                </div>
              </dl>
              <a :href="youtubeChannelUrl" target="_blank" rel="noopener noreferrer" class="wide-link">
                YouTubeでチャンネルを開く ↗
              </a>
            </aside>
          </div>

          <section v-if="homeSections.length" class="section-directory about-card">
            <h3>取得したセクション</h3>
            <div class="section-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>セクション</th>
                    <th>種類</th>
                    <th>件数</th>
                    <th>参照ID</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(section, index) in homeSections" :key="sectionKey(section, index)">
                    <td>{{ section.title }}</td>
                    <td>{{ sectionTypeLabel(section.type) }}</td>
                    <td>{{ section.items.length }}</td>
                    <td><code>{{ section.playlistId || section.browseId || "—" }}</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </div>
    </template>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import ChannelContentCard from "@/components/channel/ChannelContentCard.vue";
import VideoList from "@/components/playlist/Playlist.vue";
import { channel as fetchChannel } from "@/services/api/siatubeApi.js";
import { normalizeChannel } from "@/services/api/siatubeAdapters.js";
import subscriptionManager from "@/services/storage/subscriptionManager.js";

const props = defineProps({ channelId: String });
const route = useRoute();
const effectiveId = computed(() => props.channelId || route.params.id || "");

const channel = ref(null);
const tab = ref("home");
const loadingChannel = ref(false);
const errorMessage = ref("");
const subscribed = ref(false);
const descriptionExpanded = ref(false);
const avatarFailed = ref(false);
const bannerFailed = ref(false);
const featureImageFailed = ref(false);
const sectionScrollState = reactive({});
const sectionTrackElements = new Map();
let channelRequestSequence = 0;
let sectionTrackResizeObserver = null;

const homeSections = computed(() =>
  (channel.value?.sections || []).filter((section) => section?.items?.length)
);
const topVideo = computed(() => channel.value?.topVideo || null);
const displayedHomeSections = computed(() => {
  const topVideoId = topVideo.value?.videoId;
  return homeSections.value
    .map((section, index) => {
      if (index !== 0 || !topVideoId) return section;
      return {
        ...section,
        items: section.items.filter((item) => item.videoId !== topVideoId),
      };
    })
    .filter((section) => section.items.length);
});
const descriptionText = computed(() => plainText(channel.value?.description));
const descriptionIsLong = computed(
  () => descriptionText.value.length > 180 || descriptionText.value.split("\n").length > 3
);
const channelInitial = computed(() => (channel.value?.title || "C").trim().slice(0, 1).toUpperCase());
const youtubeChannelUrl = computed(
  () => `https://www.youtube.com/channel/${encodeURIComponent(channel.value?.channelId || effectiveId.value)}`
);

const allSectionItems = computed(() => homeSections.value.flatMap((section) => section.items));

const postItems = computed(() =>
  uniqueItems([
    ...(channel.value?.posts || []),
    ...allSectionItems.value.filter((item) => item.type === "post"),
  ])
);
const liveItems = computed(() =>
  uniqueItems([
    ...(channel.value?.live || []),
    ...allSectionItems.value.filter(
      (item) => item.type !== "post" && (item.isLive || item.isUpcoming || item.streamStatus)
    ),
  ])
);
const shortItems = computed(() =>
  uniqueItems([
    ...(channel.value?.shorts || []),
    ...allSectionItems.value.filter((item) => item.type === "short"),
  ])
);
const playlistItems = computed(() =>
  uniqueItems(allSectionItems.value.filter((item) => item.type === "playlist"))
);
const regularVideoItems = computed(() =>
  uniqueItems(
    allSectionItems.value.filter(
      (item) =>
        item.type === "video" &&
        !item.isLive &&
        !item.isUpcoming &&
        !item.streamStatus
    )
  )
);
const allUniqueItems = computed(() => uniqueItems(allSectionItems.value));
const homeItemCount = computed(() => allUniqueItems.value.length);
const playlistShelves = computed(() => {
  const seen = new Set();
  return homeSections.value.filter((section) => {
    if (!section.playlistId || seen.has(section.playlistId)) return false;
    seen.add(section.playlistId);
    return true;
  });
});

const tabs = computed(() => {
  const result = [{ id: "home", label: "ホーム", count: null }];
  if (regularVideoItems.value.length || channel.value?.uploadsPlaylistId) {
    result.push({ id: "videos", label: "動画", count: regularVideoItems.value.length || null });
  }
  if (shortItems.value.length) result.push({ id: "shorts", label: "ショート", count: shortItems.value.length });
  if (liveItems.value.length) result.push({ id: "live", label: "ライブ", count: liveItems.value.length });
  if (postItems.value.length) result.push({ id: "posts", label: "投稿", count: postItems.value.length });
  if (playlistItems.value.length || playlistShelves.value.length) {
    result.push({ id: "playlists", label: "再生リスト", count: playlistItems.value.length || playlistShelves.value.length });
  }
  result.push({ id: "about", label: "概要", count: null });
  return result;
});

const featureImage = computed(() =>
  topVideo.value?.thumbnail ||
  topVideo.value?.thumbnailUrl ||
  (topVideo.value?.videoId
    ? `https://i.ytimg.com/vi/${topVideo.value.videoId}/maxresdefault.jpg`
    : "")
);
const topVideoMeta = computed(() => {
  const title = plainText(topVideo.value?.title).replace(/\s+/g, " ").toLocaleLowerCase();
  return [topVideo.value?.author, topVideo.value?.viewCount, topVideo.value?.published]
    .filter(Boolean)
    .filter((value) => {
      const meta = plainText(value).replace(/\s+/g, " ").toLocaleLowerCase();
      return meta && (!title || (meta !== title && !(title.length >= 6 && meta.includes(title))));
    })
    .filter((value, index, values) => values.indexOf(value) === index);
});
const topVideoStatus = computed(() => {
  if (topVideo.value?.isLive || topVideo.value?.streamStatus === "live") return "● ライブ配信中";
  if (topVideo.value?.isUpcoming || topVideo.value?.streamStatus === "upcoming") return "配信予定";
  if (topVideo.value?.streamStatus === "ended") return "配信済み";
  return "注目のコンテンツ";
});

function uniqueItems(items) {
  const seen = new Set();
  return (items || []).filter((item, index) => {
    if (!item) return false;
    const key = item.videoId || item.playlistId || item.postId || item.url || `${item.type}:${item.title}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function itemKey(item, index) {
  return item.videoId || item.playlistId || item.postId || item.url || `${item.type}-${index}`;
}

function sectionKey(section, index) {
  return section.playlistId || section.browseId || `${section.type}-${section.title}-${index}`;
}

function sectionTypeLabel(type) {
  return {
    videos: "動画",
    shorts: "ショート",
    live: "ライブ",
    posts: "投稿",
    playlists: "再生リスト",
    members: "メンバー向け",
    mixed: "ミックス",
  }[type] || "コンテンツ";
}

function sectionIcon(type) {
  return {
    videos: "▷",
    shorts: "▯",
    live: "◉",
    posts: "◫",
    playlists: "▤",
    members: "♢",
    mixed: "◇",
  }[type] || "◇";
}

function sectionCardLayout(section) {
  if (section.type === "posts") return "post";
  if (section.type === "shorts") return "short";
  return "shelf";
}

function setSectionTrackRef(key, element) {
  const previousElement = sectionTrackElements.get(key);
  if (previousElement === element) return;

  if (previousElement) sectionTrackResizeObserver?.unobserve(previousElement);

  if (!element) {
    sectionTrackElements.delete(key);
    delete sectionScrollState[key];
    return;
  }

  sectionTrackElements.set(key, element);
  sectionTrackResizeObserver?.observe(element);
  nextTick(() => updateSectionScrollState(key));
}

function updateSectionScrollState(key) {
  const element = sectionTrackElements.get(key);
  if (!element) return;

  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  const scrollLeft = Math.max(0, element.scrollLeft);
  const edgeTolerance = 2;
  const canScrollLeft = scrollLeft > edgeTolerance;
  const canScrollRight = maxScrollLeft - scrollLeft > edgeTolerance;
  const currentState = sectionScrollState[key];

  if (
    currentState?.canScrollLeft === canScrollLeft &&
    currentState?.canScrollRight === canScrollRight
  ) return;

  sectionScrollState[key] = { canScrollLeft, canScrollRight };
}

function sectionCanScrollLeft(key) {
  return sectionScrollState[key]?.canScrollLeft === true;
}

function sectionCanScrollRight(key) {
  return sectionScrollState[key]?.canScrollRight === true;
}

function scrollSection(key, direction) {
  const element = sectionTrackElements.get(key);
  if (!element) return;

  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  element.scrollBy({
    left: direction * element.clientWidth * 0.85,
    behavior: prefersReducedMotion ? "auto" : "smooth",
  });
}

function updateSubscribed() {
  subscribed.value = subscriptionManager.isSubscribed(effectiveId.value);
}

function handleSubscriptionStorage(event) {
  if (event.key === "subscriptions_v1") updateSubscribed();
}

async function toggleSubscribeOnChannel() {
  const id = effectiveId.value;
  if (!id || !channel.value) return;

  try {
    if (subscriptionManager.isSubscribed(id)) {
      subscriptionManager.removeSubscription(id);
      subscribed.value = false;
    } else {
      const sourceIcon = channel.value.avatar || null;
      subscriptionManager.addSubscription({
        id,
        name: channel.value.title || "",
        icon: sourceIcon,
      });
      subscribed.value = true;

      if (sourceIcon && !sourceIcon.startsWith("data:")) {
        try {
          const icon = await subscriptionManager.fetchImageAsBase64(sourceIcon);
          if (icon) subscriptionManager.updateSubscription(id, { icon });
        } catch (error) {
          console.warn("チャンネルアイコンの保存に失敗しました", error);
        }
      }
    }
    window.dispatchEvent(new CustomEvent("subscriptions-changed"));
  } catch (error) {
    console.error("チャンネル登録状態の更新に失敗しました", error);
  }
}

function resetVisualState() {
  avatarFailed.value = false;
  bannerFailed.value = false;
  featureImageFailed.value = false;
  descriptionExpanded.value = false;
}

async function fetchChannelInfo(channelId) {
  if (!channelId) {
    channel.value = null;
    errorMessage.value = "チャンネルIDが指定されていません。";
    return;
  }

  const sequence = ++channelRequestSequence;
  loadingChannel.value = true;
  errorMessage.value = "";
  channel.value = null;
  resetVisualState();

  try {
    const data = await fetchChannel(channelId, { retries: 2, timeout: 30_000 });
    if (sequence !== channelRequestSequence || channelId !== effectiveId.value) return;
    const normalized = normalizeChannel(data);
    if (!normalized?.title) throw new Error("チャンネル名を取得できませんでした");
    channel.value = normalized;
  } catch (error) {
    if (sequence !== channelRequestSequence || channelId !== effectiveId.value) return;
    console.error("チャンネル情報取得失敗:", error);
    channel.value = null;
    errorMessage.value = error?.message || "チャンネル情報の取得に失敗しました。";
  } finally {
    if (sequence === channelRequestSequence) loadingChannel.value = false;
  }
}

function reloadChannel() {
  fetchChannelInfo(effectiveId.value);
}

function handleFeatureImageError(event) {
  const element = event.currentTarget;
  const urlFallback = topVideo.value?.thumbnailUrl;
  const youtubeFallback = topVideo.value?.videoId
    ? `https://i.ytimg.com/vi/${topVideo.value.videoId}/hqdefault.jpg`
    : "";

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
  featureImageFailed.value = true;
}

onMounted(() => {
  if (typeof ResizeObserver !== "undefined") {
    sectionTrackResizeObserver = new ResizeObserver((entries) => {
      entries.forEach(({ target }) => {
        for (const [key, element] of sectionTrackElements) {
          if (element === target) {
            updateSectionScrollState(key);
            break;
          }
        }
      });
    });
    sectionTrackElements.forEach((element) => sectionTrackResizeObserver.observe(element));
  }

  fetchChannelInfo(effectiveId.value);
  updateSubscribed();
  window.addEventListener("subscriptions-changed", updateSubscribed);
  window.addEventListener("storage", handleSubscriptionStorage);
});

watch(effectiveId, (newId, oldId) => {
  if (newId === oldId) return;
  tab.value = "home";
  fetchChannelInfo(newId);
  updateSubscribed();
  window.scrollTo({ top: 0, behavior: "auto" });
});

watch(tabs, (availableTabs) => {
  if (!availableTabs.some((item) => item.id === tab.value)) tab.value = "home";
});

watch(
  () => channel.value?.title,
  (title) => {
    document.title = title || (loadingChannel.value ? "読み込み中…" : "チャンネル");
  },
  { immediate: true }
);

onUnmounted(() => {
  channelRequestSequence += 1;
  sectionTrackResizeObserver?.disconnect();
  sectionTrackResizeObserver = null;
  sectionTrackElements.clear();
  window.removeEventListener("subscriptions-changed", updateSubscribed);
  window.removeEventListener("storage", handleSubscriptionStorage);
});
</script>

<style scoped src="../styles/channel-view.css"></style>
