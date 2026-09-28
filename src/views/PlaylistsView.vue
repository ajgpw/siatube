<template>
  <div class="playlists-container">
    
    <template v-if="!selected">
      <div class="playlists-header">
        <h1>ライブラリ</h1>
        <button class="create-btn" @click="creating = !creating">
          <span class="icon-plus">+</span> 新規作成
        </button>
      </div>

      <transition name="slide-down">
        <div v-if="creating" class="create-row">
          <input v-model="newName" placeholder="新しいプレイリスト名" @keyup.enter="createPlaylist" />
          <button class="btn-primary" @click="createPlaylist" :disabled="!newName">作成</button>
          <button class="btn-text" @click="creating = false">キャンセル</button>
        </div>
      </transition>

      <div v-if="loading" class="loading-msg">読み込み中...</div>
      <div v-else-if="playlists.length === 0" class="empty-msg">プレイリストがありません</div>

      <div class="playlists-grid">
        <div v-for="pl in playlists" :key="pl.id" class="playlist-card" @click="select(pl)">
          <div class="pl-thumb">
            <img v-if="pl.thumbnail" :src="pl.thumbnail" loading="lazy" />
            <div v-else class="pl-placeholder">{{ pl.name.charAt(0) || 'P' }}</div>
            
            <div class="pl-overlay">
              <span class="overlay-count">{{ pl.items?.length || 0 }}</span>
              <svg viewBox="0 0 24 24" class="icon-playlist"><path fill="currentColor" d="M22 7H2v2h20V7zm-9 5H2v2h11v-2zm0 5H2v2h11v-2zm2-6v8l7-4-7-4z"/></svg>
            </div>
            
            <div class="hover-play">
              <span class="play-all-text">すべて表示</span>
            </div>
          </div>
          
          <div class="pl-info">
            <div style="color: var(--normal-text);" class="pl-name">{{ pl.name }}</div>
            <div class="pl-meta">
              <span class="pl-count">{{ pl.items?.length || 0 }} 本の動画</span>
              <button class="pl-delete-icon" @click.stop="deletePlaylist(pl.id)" title="削除">
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="playlist-detail-view">
        
        <div class="detail-header">
          <button class="btn-back" @click="closeSelected" title="一覧に戻る">
            <svg viewBox="0 0 24 24" class="icon-back"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            一覧に戻る
          </button>
        </div>

        <div class="detail-content">
          <div class="detail-sidebar">
            <div class="sidebar-content">
              <div class="detail-thumb">
                <img v-if="selected.items && selected.items[0] && selected.items[0].thumbnailBinary" 
                     :src="arrayBufferToDataUrl(selected.items[0].thumbnailBinary)" />
                <div v-else class="detail-placeholder">{{ selected.name.charAt(0) }}</div>
              </div>
              
              <h2 class="detail-title">{{ selected.name }}</h2>
              <div class="detail-stats">
                <span>{{ selected.items?.length || 0 }} 本の動画</span>
                <span>・更新: 今日</span>
              </div>

              <div class="detail-actions">
                <button class="btn-play-all" @click="playPlaylist(selected)">
                  <svg viewBox="0 0 24 24" class="icon-play"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                  すべて再生
                </button>
              </div>
            </div>
            <div class="sidebar-bg-blur"></div>
          </div>

          <div class="detail-list">
            <ul class="playlist-items" v-if="selected.items && selected.items.length > 0">
              <li v-for="(item, index) in selected.items" :key="item.id" class="list-item">
                <div class="index-number">{{ index + 1 }}</div>
                
                <div class="item-thumb-wrapper" @click="playVideoDirect(item.id)">
                  <img v-if="item.thumbnailBinary" :src="arrayBufferToDataUrl(item.thumbnailBinary)" class="item-thumb" />
                  <div v-else class="item-thumb-placeholder"></div>
                </div>

                <div class="item-meta">
                  <div class="item-title" @click="playVideoDirect(item.id)">{{ item.title }}</div>
                  <div class="item-sub">
                    {{ item.authorName }} <span class="separator">•</span> {{ item.views }} 回視聴
                  </div>
                </div>

                <div class="item-actions">
                  <button class="btn-delete-item" @click.stop="removeFromPlaylist(selected.id, item.id)" title="リストから削除">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                  </button>
                </div>
              </li>
            </ul>
            <div v-else class="empty-detail-msg">
              動画が追加されていません
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getPlaylists, createPlaylist as createPl, deletePlaylist as deletePl, getPlaylistById, removeVideoFromPlaylist } from '@/services/storage/playlistManager.js';
import { useRouter } from 'vue-router';
import { arrayBufferToDataUrl } from '@/utils/imageEncoding.js';

const playlists = ref([]);
const loading = ref(true);
const creating = ref(false);
const newName = ref('');
const selected = ref(null);

const router = useRouter();

const load = async () => {
  loading.value = true;
  playlists.value = await getPlaylists();
  loading.value = false;
};

onMounted(load);

const createPlaylist = async () => {
  if(!newName.value) return;
  try {
    await createPl(newName.value, null);
    newName.value = '';
    creating.value = false;
    await load();
  } catch (e) { console.error(e); }
};

const deletePlaylist = async (id) => {
  if (!confirm('このプレイリストを削除しますか？')) return;
  try {
    await deletePl(id);
    if(selected.value && selected.value.id === id) selected.value = null;
    await load();
  } catch (e) { console.error(e); }
};

const select = async (pl) => {
  try {
    const full = await getPlaylistById(pl.id);
    selected.value = full;
    window.scrollTo(0,0);
  } catch (e) { console.error(e); }
};

const closeSelected = () => { selected.value = null; };

const playPlaylist = (pl) => {
  if (!pl.items || pl.items.length === 0) return;
  const firstVideoId = pl.items[0].id;
  router.push(`/watch?v=${firstVideoId}&list=local-${pl.id}`);
};

const playVideoDirect = (videoId) => {
  if(!selected.value) return;
  router.push(`/watch?v=${videoId}&list=local-${selected.value.id}`);
};

const removeFromPlaylist = async (plId, videoId) => {
  try {
    await removeVideoFromPlaylist(plId, videoId);
    const full = await getPlaylistById(plId);
    selected.value = full;
    await load();
  } catch (e) { console.error(e); }
};

</script>

<style scoped>
.playlists-container {
  padding: 24px;
  color: var(--text-primary);
  min-height: 100vh;
}

.playlists-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.playlists-header h1 { margin: 0; font-weight: 700; }

.create-btn {
  background: transparent;
  color: var(--accent-color);
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: 18px;
  cursor: pointer;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}
.create-btn:hover { background: rgba(62, 166, 255, 0.1); border-color: transparent; }

.create-row {
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 24px;
  display: flex;
  gap: 12px;
  align-items: center;
}
.create-row input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 4px;
}
.btn-primary { background: #3ea6ff; color: black; border:none; padding: 8px 16px; border-radius: 2px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-text { background: transparent; color: var(--text-secondary); border:none; cursor: pointer; margin-left: 8px; }
.playlists-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px 16px; /* Row Gap, Column Gap */
}

.loading-msg, .empty-msg {
  text-align: center;
  color: var(--text-secondary);
  font-size: 1rem;
  padding: 40px 0;
}

.playlist-card {
  cursor: pointer;
  group: hover;
}

/* サムネイル部分 */
.pl-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-secondary);
}
.pl-thumb img { width: 100%; height: 100%; object-fit: cover; }
.pl-placeholder { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 3rem; color: var(--text-secondary); }

/* YouTube風オーバーレイ (右側の黒帯) */
.pl-overlay {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 40%;
  background: rgba(0,0,0,0.8);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: white;
  opacity: 0.9;
  transition: opacity 0.2s;
}
.playlist-card:hover .pl-overlay { opacity: 1; background: rgba(0,0,0,0.9); }

.overlay-count { font-size: 1.1rem; font-weight: 600; margin-bottom: 4px; }
.icon-playlist { width: 24px; height: 24px; }

.hover-play {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.playlist-card:hover .hover-play { opacity: 1; }
.play-all-text { color: white; font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 8px; }

/* カード情報 */
.pl-info { margin-top: 12px; }
.pl-name { font-weight: 600; font-size: 1rem; color: var(--text-primary); margin-bottom: 4px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;}
.pl-meta { display: flex; justify-content: space-between; align-items: flex-start; }
.pl-count { color: var(--text-secondary); font-size: 0.85rem; }

.pl-delete-icon {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  width: 24px; height: 24px;
  padding: 0;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s;
}
.playlist-card:hover .pl-delete-icon { opacity: 1; }
.pl-delete-icon:hover { color: #ff4e45; }

/* === 詳細画面 (2カラムレイアウト) === */
.playlist-detail-view {
  /* レイアウト変更 */
}

.detail-header {
  margin-bottom: 24px;
}

.btn-back {
  background: transparent;
  color: var(--text-primary);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  padding: 8px 0;
}
.btn-back:hover {
  color: var(--accent-color);
}

.icon-back {
  width: 24px;
  height: 24px;
}

.detail-content {
  display: flex;
  gap: 24px;
}

/* 左サイドバー (固定情報) */
.detail-sidebar {
  width: 320px;
  min-width: 320px;
  position: relative;
  padding: 24px;
  border-radius: 18px;
  overflow: hidden;
  height: fit-content;
  position: sticky;
  top: 20px;
}
/* ガラス風背景 */
.sidebar-bg-blur {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(255,255,255,0.1), rgba(0,0,0,0.2));
  backdrop-filter: blur(20px);
  z-index: 0;
}
.sidebar-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; text-align: center; }

.detail-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 16px rgba(0,0,0,0.3);
  margin-bottom: 20px;
  background: var(--bg-secondary);
}
.detail-thumb img { width: 100%; height: 100%; object-fit: cover; }
.detail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 4rem; color: var(--text-secondary); }

.detail-title { font-size: 1.8rem; margin: 0 0 12px 0; font-weight: 700; line-height: 1.2; }
.detail-stats { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 24px; font-weight: 500; }

.detail-actions { display: flex; gap: 12px; }
.btn-play-all {
  flex: 1;
  background: white;
  color: black;
  border: none;
  border-radius: 20px;
  padding: 10px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.btn-play-all:hover { background: #eee; }
.icon-play { width: 24px; height: 24px; }

/* 右リスト (動画一覧) */
.detail-list { flex: 1; }
.playlist-items { list-style: none; padding: 0; margin: 0; }
.list-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}
.list-item:hover { background: var(--hover-bg); }

.index-number { width: 24px; text-align: center; color: var(--text-secondary); font-size: 0.9rem; margin-right: 12px; }

.item-thumb-wrapper {
  width: 160px;
  height: 90px;
  margin-right: 16px;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}
.item-thumb { width: 100%; height: 100%; object-fit: cover; }
.item-thumb-placeholder { width: 100%; height: 100%; background: var(--bg-secondary); }

.item-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.item-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.item-sub { color: var(--text-secondary); font-size: 0.85rem; display: flex; align-items: center; }
.separator { margin: 0 4px; }

.item-actions { opacity: 0; margin-left: 12px; }
.list-item:hover .item-actions { opacity: 1; }
.btn-delete-item {
  background: transparent; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 8px;
}
.btn-delete-item:hover { color: #ff4e45; }

.empty-detail-msg {
  text-align: center;
  color: var(--text-secondary);
  font-size: 1rem;
  padding: 40px 0;
}

/* レスポンシブ */
@media (max-width: 1000px) {
  .detail-content { flex-direction: column; }
  .detail-sidebar { width: 100%; min-width: auto; position: static; padding: 16px; display: flex; gap: 24px; align-items: flex-start; }
  .sidebar-bg-blur { background: linear-gradient(to right, rgba(255,255,255,0.05), rgba(0,0,0,0)); }
  .detail-thumb { width: 180px; margin-bottom: 0; }
  .sidebar-content { flex-direction: row; width: 100%; gap: 24px; text-align: left; }
  .detail-actions { width: auto; flex: 1; }
}

@media (max-width: 768px) {
  .playlists-container { margin-left: 0; padding: 16px; }
  .sidebar-content { flex-direction: column; text-align: center; }
  .detail-thumb { width: 60%; margin: 0 auto 16px auto; }
  .item-thumb-wrapper { width: 120px; height: 68px; }
  .item-title { font-size: 0.9rem; white-space: normal; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .item-actions { opacity: 1; } /* スマホでは常時表示 */
}
</style>
