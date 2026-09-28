<template>
  <!-- メインボタン -->
  <button type="button" @click="openPopup" class="download-main-btn" style="display: flex;">
    <span><div style="width: 90%; height: 90%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M12 2a1 1 0 00-1 1v11.586l-4.293-4.293a1 1 0 10-1.414 1.414L12 18.414l6.707-6.707a1 1 0 10-1.414-1.414L13 14.586V3a1 1 0 00-1-1Zm7 18H5a1 1 0 000 2h14a1 1 0 000-2Z"></path></svg></div></span>
    ダウンロード
  </button>

  <!-- ポップアップ -->
  <div v-if="popupVisible" class="popup-overlay">
    <div class="popup">
      <button class="close-btn" @click="closePopup">×</button>

      <div v-if="loading">読み込み中…</div>

      <div v-else-if="error" class="error">
        {{ error }}
        <button class="retry-btn" @click="fetchStream(true)">再取得</button>
      </div>

      <div v-else>
        <h3>ダウンロード</h3>

        <div class="main-flex-row">
          <div class="main-options">
            <!-- 標準ダウンロード（360p複数対応） -->
            <div class="option" v-if="muxed360pList.length">
              <strong>標準（360p）:</strong>
              <div v-for="item in muxed360pList" :key="item.url">
                <a :href="item.url" target="_blank" rel="noopener" download>ダウンロード</a>
              </div>
            </div>

            <!-- 音声のみ（複数対応） -->
            <div class="option" v-if="audioOnlyList.length">
              <strong>音声のみ:</strong>
              <div v-for="item in audioOnlyList" :key="item.url">
                {{ item.ext }}:
                <a :href="item.url" target="_blank" rel="noopener"  download>ダウンロード</a>
              </div>
            </div>

            <!-- 映像のみ（複数対応） -->
            <div class="option" v-if="videoOnlyList.length">
              <strong>映像のみ:</strong>
              <div v-for="item in videoOnlyList" :key="item.url">
                {{ item.resolution }} ({{ item.ext }}):
                <a :href="item.url" target="_blank" rel="noopener" download>ダウンロード</a>
              </div>
            </div>

            <!-- m3u8 proxy -->
            <div class="option" v-if="m3u8ProxyList.length">
              <strong>m3u8（proxy）<span style="font-weight: normal;">*外部サイト(<a href="https://m3u8.dev">https://m3u8.dev</a>)との併用でダウンロード可能 *制限がない環境:</span></strong>
              <div v-for="u in m3u8ProxyList" :key="u.url" class="m3u8-row">
                <div class="meta">
                  {{ u.resolution || "-" }}
                </div>
                <button class="copy-link" @click="copyUrl(u.url)">
                  <span class="url-line">{{ u.url }}</span>
                </button>
                <span class="copied" v-if="lastCopied === u.url">コピーしました</span>
              </div>
            </div>

            <!-- m3u8 raw -->
            <div class="option" v-if="m3u8RawList.length">
              <strong>m3u8　<span style="font-weight: normal;">直接のダウンロードはできません</span>:</strong>
              <div v-for="u in m3u8RawList" :key="u.url" class="m3u8-row">
                <div class="meta">
                  {{ u.resolution || "-" }}
                </div>
                <button class="copy-link" @click="copyUrl(u.url)">
                  <span class="url-line">{{ u.url }}</span>
                </button>
                <span class="copied" v-if="lastCopied === u.url">コピーしました</span>
              </div>
            </div>

            <div class="option" v-if="subtitleList.length">
              <strong>字幕（VTT）:</strong>
              <div v-for="track in subtitleList" :key="track.src">
                {{ track.label }}:
                <a :href="track.src" target="_blank" rel="noopener" download>ダウンロード</a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { stream as fetchSiaTubeStream } from "@/services/api/siatubeApi.js";
import {
  extractSubtitleTracks,
  normalizeDownloadStreams,
} from "@/services/api/siatubeAdapters.js";

const props = defineProps({
  videoId: { type: String, required: true }
});

const popupVisible = ref(false);
const streamData = ref(null);
const error = ref("");
const loading = ref(false);

const muxed360pList = ref([]);
const audioOnlyList = ref([]);
const videoOnlyList = ref([]);
const m3u8RawList = ref([]);
const m3u8ProxyList = ref([]);
const subtitleList = ref([]);
const lastCopied = ref("");
let requestSequence = 0;

function openPopup() {
  popupVisible.value = true;
  if (!streamData.value) {
    fetchStream();
  }
}

function closePopup() {
  requestSequence += 1;
  popupVisible.value = false;
  streamData.value = null;
  muxed360pList.value = [];
  audioOnlyList.value = [];
  videoOnlyList.value = [];
  m3u8RawList.value = [];
  m3u8ProxyList.value = [];
  subtitleList.value = [];
  error.value = "";
  loading.value = false;
  lastCopied.value = "";
}

async function fetchStream(forceRefresh = false) {
  const id = props.videoId;
  const sequence = ++requestSequence;
  loading.value = true;
  error.value = "";
  streamData.value = null;

  try {
    const data = await fetchSiaTubeStream(id, {
      forceRefresh: forceRefresh === true,
      retries: 1,
      timeout: 30000,
    });
    if (sequence !== requestSequence || id !== props.videoId) return;
    streamData.value = data;
  } catch (e) {
    if (sequence !== requestSequence || id !== props.videoId) return;
    error.value = e?.connectionFailure
      ? e.message
      : "ストリームの取得に失敗しました（fetch error）";
    streamData.value = null;
    muxed360pList.value = [];
    audioOnlyList.value = [];
    videoOnlyList.value = [];
    m3u8RawList.value = [];
    m3u8ProxyList.value = [];
    subtitleList.value = [];
  } finally {
    if (sequence !== requestSequence || id !== props.videoId) return;
    // 共通の後処理（data がセットされていれば下でマップ処理）
    if (streamData.value) {
      const data = streamData.value;
      const normalized = normalizeDownloadStreams(data);
      const preferredMuxed = normalized.muxed.filter(
        (item) => Number(item.height) === 360 || item.formatNote === "360p"
      );
      muxed360pList.value = (preferredMuxed.length ? preferredMuxed : normalized.muxed)
        .map((item) => ({ url: item.url, resolution: item.formatNote || item.resolution }));
      audioOnlyList.value = normalized.audio.map((item) => ({
        ext: item.ext,
        url: item.url,
        language: item.language?.name || "",
      }));
      videoOnlyList.value = normalized.video.map((item) => ({
        resolution: item.formatNote || item.resolution,
        ext: item.ext,
        url: item.url,
      }));
      m3u8RawList.value = normalized.hls.map((item) => ({
        url: item.url,
        resolution: item.formatNote || item.resolution,
      }));
      m3u8ProxyList.value = [];
      const locale = typeof navigator !== "undefined" ? navigator.language : "ja";
      subtitleList.value = extractSubtitleTracks(data, locale);
    }
    loading.value = false;
  }
}

watch(
  () => props.videoId,
  () => closePopup()
);

async function copyUrl(url) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    lastCopied.value = url;
    setTimeout(() => {
      if (lastCopied.value === url) lastCopied.value = "";
    }, 1500);
  } catch (e) {
    // ignore silently
    lastCopied.value = "";
  }
}
</script>

<style scoped>
.main-flex-row {
  display: flex;
  flex-direction: row;
  gap: 32px;
  align-items: flex-start;
}
.main-options {
  flex: 1;
}
.download-main-btn {
  appearance: none;
  padding: 6px 11px;
  background: var(--download-button);
  color: var(--text-primary);
  border: none;
  border-radius: 30px;
  outline: none;
  box-shadow: none;
  cursor: pointer;
}

.download-main-btn:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.popup {
  background: var(--bg-primary);
  padding: 20px;
  border-radius: 8px;
  width: 520px;
  position: relative;
  max-height: 80vh;
  overflow-y: auto;
}

.close-btn {
  position: absolute;
  right: 10px;
  top: 10px;
  border: none;
  background: none;
  font-size: 28px;
  cursor: pointer;
  color: var(--text-primary);
}

.option {
  margin-top: 12px;
}

.error {
  color: var(--accent-weak);
  margin-top: 10px;
}

.retry-btn {
  margin-top: 8px;
  padding: 6px 12px;
  background: var(--text-secondary);
  color: var(--on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: background-color 0.2s ease;
}
.retry-btn:hover {
  background: var(--text-secondary-hover);
  color: var(--on-accent);
}

/* m3u8 表示のスタイル */
.m3u8-row {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.meta {
  font-size: 12px;
  color: var(--text-primary);
}

/* m3u8のURL */
.copy-link {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.url-line {
  display: block;
  white-space: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  font-family: monospace;
  font-size: 12px;
  color: var(--accent-color);
  text-decoration: underline;
  background: var(--bg-secondary);
  padding: 6px;
  border-radius: 4px;
}

/* コピー済み表示 */
.copied {
  font-size: 12px;
  color: var(--success);
  margin-top: 4px;
}
</style>
