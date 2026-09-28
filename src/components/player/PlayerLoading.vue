<template>
  <div
    class="player-loading"
    :class="{ 'is-overlay': overlay }"
    role="status"
    aria-live="polite"
    aria-label="動画を読み込んでいます"
  >
    <div class="player-loading-content">
      <span class="player-loading-spinner" aria-hidden="true"></span>
      <slot></slot>
    </div>
    <span class="visually-hidden">動画を読み込んでいます</span>
  </div>
</template>

<script setup>
defineProps({
  overlay: { type: Boolean, default: false },
});
</script>

<style scoped>
.player-loading {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: #000;
}

.player-loading.is-overlay {
  position: absolute;
  inset: 0;
  z-index: 25;
  aspect-ratio: auto;
}

.player-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.player-loading-spinner {
  width: 46px;
  height: 46px;
  border: 4px solid rgb(255 255 255 / 0.24);
  border-top-color: #fff;
  border-radius: 50%;
  animation: player-loading-spin 800ms linear infinite;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes player-loading-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .player-loading-spinner {
    width: 38px;
    height: 38px;
    border-width: 3px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-loading-spinner {
    animation: none;
  }
}
</style>
