<template>
  <div class="video-wrapper">
      <StreamType1 v-if="currentStreamType === '1'" :videoId="videoId" :videoTitle="videoTitle" @ended="onEnded" @play-autoplay-candidate="onPlayAutoplayCandidate" @autoplay-no-suitable-video="onAutoplayNoSuitableVideo" />
      <StreamType2 v-else-if="currentStreamType === '2'" :videoId="videoId" :videoTitle="videoTitle" :videoArtist="videoArtist" :videoThumbnail="videoThumbnail" @ended="onEnded" @play-autoplay-candidate="onPlayAutoplayCandidate" @autoplay-no-suitable-video="onAutoplayNoSuitableVideo" @loading-timeout-reload="reloadType2ViaType1" />
      <StreamType3 v-else-if="currentStreamType === '3'" :videoId="videoId" @ended="onEnded" />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import StreamType1 from "./StreamType1.vue";
import StreamType2 from "./StreamType2.vue";
import StreamType3 from "./StreamType3.vue";

// props
const props = defineProps({
  videoId: { type: String, required: true },
  videoTitle: { type: String, default: "" },
  videoArtist: { type: String, default: "" },
  videoThumbnail: { type: String, default: "" },
  streamType: { type: String, default: "" }
});

const emit = defineEmits(["ended", "play-autoplay-candidate", "autoplay-no-suitable-video"]);
let type2ReloadTimer = null;
let type2ReloadInProgress = false;

function getDefaultStreamType() {
  try {
    // streamType が指定されている場合はそれを使用
    if (props.streamType) {
      return props.streamType;
    }
    // localStorage から読み込む
    const fromStorage = localStorage.getItem("defaultPlaybackMode");
    if (fromStorage) {
      return fromStorage;
    }
    // Cookie からの読み込みも試みる
    const match = document.cookie.match(
      new RegExp("(^| )StreamType=([^;]+)")
    );
    if (match) {
      return decodeURIComponent(match[2]);
    }
  } catch (e) {
    console.warn("getDefaultStreamType error:", e);
  }
  return "1";
}

const currentStreamType = ref(getDefaultStreamType());
console.log("[StreamPlayer] setup", {
  propStreamType: props.streamType,
  initial: currentStreamType.value,
});

function onEnded(payload) {
  emit('ended', payload);
}

function onPlayAutoplayCandidate({ id }) {
  if (id) {
    emit('play-autoplay-candidate', { id });
  }
}

function onAutoplayNoSuitableVideo() {
  emit('autoplay-no-suitable-video');
}

function reloadType2ViaType1() {
  if (currentStreamType.value !== "2" || type2ReloadInProgress) return;
  type2ReloadInProgress = true;
  currentStreamType.value = "1";
  type2ReloadTimer = window.setTimeout(() => {
    type2ReloadTimer = null;
    if (currentStreamType.value === "1") {
      currentStreamType.value = "2";
    }
    type2ReloadInProgress = false;
  }, 200);
}

onBeforeUnmount(() => {
  if (type2ReloadTimer !== null) {
    window.clearTimeout(type2ReloadTimer);
    type2ReloadTimer = null;
  }
});

onMounted(() => {
  // マウント時に streamType prop が empty な場合、localStorage から読み込む
  if (!props.streamType) {
    const defaultType = getDefaultStreamType();
    currentStreamType.value = defaultType;
  }
  console.log("[StreamPlayer] mounted", {
    propStreamType: props.streamType,
    current: currentStreamType.value,
  });
});

watch(
  () => props.streamType,
  (newType) => {
    console.log("[StreamPlayer] props.streamType changed", { newType });
    if (newType) {
      currentStreamType.value = newType;
    }
  }
);

watch(currentStreamType, (val) => {
  console.log("[StreamPlayer] currentStreamType changed", { val });
});
</script>

<style scoped>
.video-container {
  position: relative;
  aspect-ratio: 16 / 9;
  background: #000;
  overflow: hidden;
}
.video-container iframe,
.video-container video,
.video-container audio {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.settings-box {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  background: rgba(0, 0, 0, 0.75);
  color: var(--on-accent);
  padding: 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  transition: opacity 0.3s ease;
}

.selector {
  background: var(--ui-dark);
  color: var(--on-accent);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 6px;
  margin-left: 6px;
}

.reload-button {
  margin-top: 6px;
  padding: 6px 12px;
  font-size: 9px;
  background: var(--text-primary);
  color: var(--on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 50%;
}
.reload-button:hover {
  background: var(--text-secondary);
}

audio {
  display: none;
}

.full-screen-video video {
  width: 100vw;
  height: 100vh;
  object-fit: contain; 
}

.block-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.315);
  pointer-events: all;
}
</style>
