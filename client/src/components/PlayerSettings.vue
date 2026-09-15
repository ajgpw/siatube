<template>
  <div v-if="!isMobile" v-show="visible" class="settings-box"
    @mouseenter="$emit('interaction')" @click.stop="$emit('interaction')">
    <slot />
  </div>
  <template v-else>
    <button type="button" class="player-settings-toggle" aria-label="再生設定を開く"
      aria-haspopup="dialog" :aria-expanded="isOpen" @click.stop="openSettings">
      <span aria-hidden="true"></span> 設定
    </button>
    <dialog ref="dialog" class="player-settings-dialog" aria-label="再生設定"
      @close="isOpen = false" @click="closeOnBackdrop">
      <header class="player-settings-header">
        <strong>再生設定</strong>
        <button type="button" autofocus aria-label="再生設定を閉じる" @click="dialog.close()">閉じる</button>
      </header>
      <div class="player-settings-fields"><slot /></div>
    </dialog>
  </template>
</template>

<script setup>
import { ref, onBeforeUnmount } from 'vue';

defineProps({ visible: { type: Boolean, default: true } });
defineEmits(['interaction']);
const media = window.matchMedia('(max-width: 789px)');
const isMobile = ref(media.matches);
const isOpen = ref(false);
const dialog = ref(null);

function openSettings() {
  dialog.value?.showModal();
  isOpen.value = true;
}
function closeOnBackdrop(event) {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.value.close();
}
function updateViewport(event) {
  dialog.value?.close();
  isOpen.value = false;
  isMobile.value = event.matches;
}
media.addEventListener('change', updateViewport);
onBeforeUnmount(() => {
  dialog.value?.close();
  media.removeEventListener('change', updateViewport);
});
</script>

<style scoped>
.settings-box {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 20;
  box-sizing: border-box;
  min-width: 140px;
  padding: 10px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgb(0 0 0 / 75%);
  color: var(--on-accent);
  font-size: 14px;
}
.player-settings-toggle {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 22px;
  background: rgb(0 0 0 / 75%);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
.player-settings-dialog {
  box-sizing: border-box;
  position: fixed;
  inset: auto 0 0;
  margin: 0 auto;
  width: min(100%, 560px);
  max-width: 100%;
  max-height: calc(100dvh - 24px);
  padding: 0 16px max(16px, env(safe-area-inset-bottom));
  border: 1px solid var(--border-color);
  border-radius: 20px 20px 0 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.player-settings-dialog::backdrop { background: rgb(0 0 0 / 55%); }
.player-settings-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}
.player-settings-fields { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; }
.player-settings-fields :deep(label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 44px;
  font-size: 16px;
}
.player-settings-fields :deep(select) {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  min-height: 44px;
  margin: 0;
  font-size: 16px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}
.player-settings-fields :deep(input[type='checkbox']) { width: 24px; height: 24px; accent-color: var(--accent-color); }
.player-settings-fields :deep(.autoplay-disabled) { color: var(--text-secondary); }
.player-settings-fields :deep(.autoplay-disabled)::after { display: none; }
.player-settings-dialog :deep(button) {
  min-height: 44px;
  width: auto;
  margin: 0;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 16px;
  cursor: pointer;
}
.player-settings-dialog :deep(:focus-visible), .player-settings-toggle:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}
</style>
