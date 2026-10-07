<template>
  <div v-if="enabled" class="ambient-light" aria-hidden="true">
    <img
      v-if="thumbnail"
      :key="thumbnail"
      :src="thumbnail"
      alt=""
      class="ambient-light-source"
      :class="{ 'is-visible': thumbnailLoaded && !hasFrame }"
      draggable="false"
      @load="thumbnailLoaded = true"
      @error="thumbnailLoaded = false"
    />
    <canvas
      ref="canvasRef"
      width="96"
      height="54"
      class="ambient-light-source"
      :class="{ 'is-visible': hasFrame }"
    ></canvas>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useAmbientLight } from "@/composables/useAmbientLight.js";
import { createAmbientLightRenderer } from "@/utils/player/ambientLightRenderer.js";

const props = defineProps({
  video: { type: Object, default: null },
  thumbnail: { type: String, default: "" },
});
const { enabled } = useAmbientLight();
const canvasRef = ref(null);
const hasFrame = ref(false);
const thumbnailLoaded = ref(false);
const reducedMotion = ref(false);
let renderer = null;
let motionQuery = null;

function stopRenderer() {
  renderer?.dispose();
  renderer = null;
  hasFrame.value = false;
}

function syncMotionPreference() {
  reducedMotion.value = !!motionQuery?.matches;
}

watch(() => props.thumbnail, () => { thumbnailLoaded.value = false; });
watch([enabled, reducedMotion, () => props.video, canvasRef], () => {
  stopRenderer();
  if (!enabled.value || reducedMotion.value || !props.video || !canvasRef.value) return;
  renderer = createAmbientLightRenderer(props.video, canvasRef.value, {
    onFrame: () => { hasFrame.value = true; },
    onReset: () => { hasFrame.value = false; },
  });
}, { flush: "post" });

onMounted(() => {
  motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
  syncMotionPreference();
  if (motionQuery?.addEventListener) motionQuery.addEventListener("change", syncMotionPreference);
  else motionQuery?.addListener?.(syncMotionPreference);
});
onBeforeUnmount(() => {
  stopRenderer();
  if (motionQuery?.removeEventListener) motionQuery.removeEventListener("change", syncMotionPreference);
  else motionQuery?.removeListener?.(syncMotionPreference);
});
</script>

<style scoped>
.ambient-light {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  user-select: none;
  opacity: 0.4;
  filter: blur(clamp(24px, 4vw, 56px)) saturate(1.5);
}

html.dark-mode .ambient-light { opacity: 0.55; }

.ambient-light-source {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  transform: scale(1.14, 1.2);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ambient-light-source.is-visible { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .ambient-light-source { transition: none; }
}
</style>
