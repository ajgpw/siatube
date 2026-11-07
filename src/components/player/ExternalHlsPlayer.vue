<template>
  <div class="external-hls-player">
    <div class="external-hls-copy">
      <strong>このストリームは外部プレイヤーで再生します</strong>
      <span>通常形式の動画URLがないため、m3u8を直接開きます。</span>
    </div>
    <label v-if="availableQualities.length > 1" class="external-hls-quality">
      画質
      <select
        :value="selectedQuality"
        @change="$emit('update:selectedQuality', $event.target.value)"
      >
        <option v-for="quality in availableQualities" :key="quality" :value="quality">
          {{ qualityLabels[quality] || quality }}
        </option>
      </select>
    </label>
    <a
      :href="url"
      target="_blank"
      rel="noopener noreferrer"
      class="external-hls-link"
    >新しいタブで再生</a>
  </div>
</template>

<script setup>
defineProps({
  url: { type: String, required: true },
  selectedQuality: { type: String, default: "" },
  availableQualities: { type: Array, default: () => [] },
  qualityLabels: { type: Object, default: () => ({}) },
});

defineEmits(["update:selectedQuality"]);
</script>

<style scoped>
.external-hls-player {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2vw, 22px);
  padding: clamp(12px, 2vw, 28px);
  box-sizing: border-box;
  overflow: auto;
  color: #fff;
  text-align: center;
}

.external-hls-copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.external-hls-copy strong {
  font-size: clamp(17px, 2.5vw, 24px);
}

.external-hls-copy span {
  color: #fff;
  font-size: 14px;
}

.external-hls-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 22px;
  border-radius: 999px;
  background: #fff;
  color: #111;
  font-weight: 800;
  text-decoration: none;
  flex-shrink: 0;
}

.external-hls-quality {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}

.external-hls-quality select {
  min-height: 44px;
  max-width: 100%;
  padding: 4px 12px;
  border: 1px solid #888;
  border-radius: 6px;
  background: #222;
  color: #fff;
  font: inherit;
}

.external-hls-link:hover {
  background: #ddd;
}
</style>
