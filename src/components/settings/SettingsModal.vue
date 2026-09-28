<template>
  <div v-if="modelValue" class="settings-modal" role="dialog" aria-modal="true">
    <h3>設定</h3>
    <p class="api-note">API: https://siatube.com</p>

    <div class="settings-group">
      <h4>デフォルト再生方式</h4>
      <label><input type="radio" :checked="defaultPlaybackMode === '1'" @change="$emit('update:defaultPlaybackMode', '1')" /> 通常</label>
      <label><input type="radio" :checked="defaultPlaybackMode === '2'" @change="$emit('update:defaultPlaybackMode', '2')" /> タイプ2</label>
    </div>

    <div class="settings-group">
      <h4>表示設定</h4>
      <label><input type="radio" :checked="displayMode === 'device'" @change="$emit('update:displayMode', 'device')" /> デバイスに合わせる</label>
      <label><input type="radio" :checked="displayMode === 'light'" @change="$emit('update:displayMode', 'light')" /> ライト</label>
      <label><input type="radio" :checked="displayMode === 'dark'" @change="$emit('update:displayMode', 'dark')" /> ダーク</label>
    </div>

    <button type="button" @click="$emit('close')">閉じる</button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: Boolean,
  defaultPlaybackMode: String,
  displayMode: String,
});

defineEmits([
  "update:defaultPlaybackMode",
  "update:displayMode",
  "close",
]);
</script>

<style scoped>
.settings-modal {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: 320px;
  padding: 14px;
  z-index: 2000;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  background: var(--bg-primary);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.settings-group {
  display: grid;
  gap: 6px;
  margin: 12px 0;
}

.settings-group h4,
.settings-modal h3 {
  margin: 0;
}

.api-note {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
}
</style>
