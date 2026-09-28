<template>
  <div class="external-hls-player">
    <div class="external-hls-copy">
      <strong>このストリームは外部プレイヤーで再生します</strong>
      <span>通常形式の動画URLがないため、m3u8を直接開きます。</span>
    </div>
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
});
</script>

<style scoped>
.external-hls-player {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 28px;
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
}

.external-hls-link:hover {
  background: #ddd;
}
</style>
