<template>
  <div class="subscriptions-container">
    <h1 style="margin-block-start: 5px; margin-block-end: 8px;">登録チャンネル</h1>

    <div class="subs-topbar">
      <div
        style="outline: 0px"
        class="subs-item special"
        :class="{ active: active === 'new' }"
        @click="selectNewest"
      >
        <div class="name special-label">新しい順</div>
      </div>

      <div
        v-for="s in subscriptions"
        :key="s.id"
        class="subs-item"
        :class="{ active: active === s.id }"
        @click="selectChannel(s)"
        @contextmenu.prevent="remove(s.id)"
        title="右クリックで登録解除"
      >
        <img v-if="s.icon" :src="s.icon" class="round-icon" />
        <div v-else class="round-icon fallback"></div>
        <div class="name">{{ s.name }}</div>
      </div>
    </div>

    <div class="subs-content">
      <ChannelView v-if="selectedChannelId" :channel-id="selectedChannelId" />
      <Playlist v-else-if="selectedPlaylistId" :playlist-id="selectedPlaylistId" />
      <div v-else class="empty">登録がありません。動画の視聴ページで「登録」ボタンを押すとここに表示されます。</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import Playlist from '@/components/playlist/Playlist.vue';
import ChannelView from '@/views/ChannelView.vue';
import subscriptionManager from '@/services/storage/subscriptionManager.js';

const subscriptions = ref([]);
const selectedPlaylistId = ref('');
const selectedChannelId = ref('');
const active = ref('');

function load() {
  subscriptions.value = subscriptionManager.getSubscriptions();
}

function onSubscriptionsChanged() {
  load();
  // if the '新しい順' view is active, refresh it to reflect new order
  if (active.value === 'new') {
    selectNewest();
  }
}

function selectNewest() {
  selectedChannelId.value = '';
  const list = [...subscriptions.value].sort((a,b) => b.addedAt - a.addedAt).map(s => s.id);
  if (!list.length) {
    selectedPlaylistId.value = '';
    active.value = '';
    return;
  }
  selectedPlaylistId.value = list.join('====');
  active.value = 'new';
}

function selectChannel(s) {
  selectedChannelId.value = s.id;
  selectedPlaylistId.value = '';
  active.value = s.id;
}

function remove(id) {
  if (!confirm('このチャンネル登録を解除しますか？')) return;
  subscriptionManager.removeSubscription(id);
  load();
  if (active.value === id) {
    selectedPlaylistId.value = '';
    selectedChannelId.value = '';
    active.value = '';
  }
}

onMounted(() => {
  load();
  // Automatically show 新しい順 when opening the page
  selectNewest();
  window.addEventListener('subscriptions-changed', onSubscriptionsChanged);
});

onUnmounted(() => {
  window.removeEventListener('subscriptions-changed', onSubscriptionsChanged);
});
</script>

<style scoped>
.subscriptions-container {
  padding: 24px;
}

.subs-topbar {
  padding-top: 3px;
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 3px;
  margin-bottom: 0px;
}

.subs-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 92px;
  cursor: pointer;
}

.subs-item .round-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-secondary);
}

.subs-item .round-icon.fallback {
  display: inline-block;
}

.subs-item .name {
  margin-top: 8px;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  width: 100%;
}

.subs-item.active {
  outline: 2px solid var(--accent-color);
  border-radius: 8px;
  padding: 6px;
}

.subs-item.special .special-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.subs-content {
  margin-top: 8px;
}

.empty {
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .subscriptions-container {
    margin-left: 2px;
  }
}
</style>
