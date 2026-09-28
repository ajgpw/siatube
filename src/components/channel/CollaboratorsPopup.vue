<template>
  <div class="collab-overlay" @click.self="close">
    <div class="collab-modal" role="dialog" aria-modal="true">
      <button class="collab-close" @click="close" aria-label="閉じる">✕</button>
      <h2 class="collab-title">コラボレーター</h2>
      <ul class="collab-list">
        <li v-for="(c, idx) in collaborators" :key="c.id || idx" class="collab-item">
          <router-link
            v-if="c.channelId"
            :to="`/channel/${c.channelId}`"
            class="collab-link"
            @click="close"
            :aria-label="c.name ? `チャンネル ${c.name} を開く` : 'チャンネルを開く'"
          >
            <img :src="c.thumbnail || ''" class="collab-thumb" alt="コラボチャンネルのサムネイル" @error="onImgError($event)" />
            <div class="collab-meta">
              <div class="collab-name">{{ c.name || '情報なし' }}</div>
              <div class="collab-sub">{{ c.subtitle || c.subscribers || '' }}</div>
            </div>
          </router-link>

          <div v-else class="collab-link" tabindex="0" role="group" :aria-label="c.name || '情報なし'">
            <img :src="c.thumbnail || ''" class="collab-thumb" alt="コラボチャンネルのサムネイル" @error="onImgError($event)" />
            <div class="collab-meta">
              <div class="collab-name">{{ c.name || '情報なし' }}</div>
              <div class="collab-sub">{{ c.subtitle || c.subscribers || '' }}</div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue';
const props = defineProps({ collaborators: { type: Array, default: () => [] } });
const emit = defineEmits(['close']);
function close() { emit('close'); }
function onImgError(e) { e.target.src = 'https://via.placeholder.com/48?text=?'; }
</script>

<style scoped>
.collab-overlay {
  position: fixed;
  inset: 0;
  background: #00000045;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.collab-modal {
  background-color: var(--normal-back-color);
  color: var(--normal-color);
  padding: 16px;
  border-radius: 8px;
  width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  position: relative;
}
.collab-close {
  position: absolute;
  right: 8px;
  top: 8px;
  background: transparent;
  border: none;
  color: var(--normal-color);
  font-size: 16px;
}
.collab-title { margin: 0 0 8px 0;}
.collab-list { list-style: none; padding: 0; margin: 0; }
.collab-item { display:flex; gap:8px; align-items:center; padding: 8px 4px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.collab-thumb { width:48px; height:48px; object-fit:cover; border-radius:50%; }
.collab-link { display:flex; gap:8px; align-items:center; color:inherit; text-decoration:none; }
.collab-link:focus { outline: 2px solid var(--accent-color); outline-offset: 2px; }
.collab-meta { display:flex; flex-direction:column; }
.collab-name { font-weight:600; }
.collab-sub { font-size: 12px; color: var(--muted-color, #8e9397ff); }
</style>