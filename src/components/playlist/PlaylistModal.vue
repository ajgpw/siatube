<template>
  <div class="playlist-modal-backdrop" @click.self="close">
    <div class="playlist-modal">
      <h3>プレイリストに追加</h3>

      <div class="existing-list">
        <p v-if="playlists.length===0">既存のプレイリストがありません。新規作成してください。</p>
        <ul>
          <li v-for="pl in playlists" :key="pl.id">
            <button class="pl-item" @click="addToPlaylist(pl.id)">
              <img v-if="pl.thumbnail" :src="pl.thumbnail" class="pl-thumb" />
              <span style="color: var(--normal-text);" class="pl-name">{{ pl.name }}</span>
              <span style="color: var(--normal-text);" class="pl-count">({{ pl.items?.length || 0 }})</span>
            </button>
          </li>
        </ul>
      </div>

      <div class="create-new">
        <h4>新規作成</h4>
        <input v-model="newName" placeholder="プレイリスト名" />
        <button @click="createAndAdd" :disabled="!newName">作成して追加</button>
      </div>

      <button class="close-btn" @click="close">閉じる</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getPlaylists, createPlaylist, addVideoToPlaylist } from '@/services/storage/playlistManager.js';
import { toRaw } from 'vue';

const props = defineProps({ video: { type: Object, required: true } });
const emit = defineEmits(['close','added']);

const playlists = ref([]);
const newName = ref('');

async function load() {
  playlists.value = await getPlaylists();
}

onMounted(load);

async function addToPlaylist(id) {
  try {
    await addVideoToPlaylist(id, props.video);
    emit('added', { playlistId: id });
    close();
  } catch (e) { console.error(e); }
}

async function createAndAdd() {
  try {
    const pl = await createPlaylist(newName.value, props.video.thumbnail);
    await addVideoToPlaylist(pl.id, props.video);
    emit('added', { playlistId: pl.id });
    close();
  } catch (e) { console.error(e); }
}

function close() { emit('close'); }
</script>

<style scoped>
.playlist-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;z-index:2000}
.playlist-modal{background:var(--bg-primary);color:var(--text-primary);padding:20px;border-radius:8px;width:420px;max-width:90%;box-shadow:0 8px 24px rgba(0,0,0,0.2)}
.playlist-modal h3{margin:0 0 12px 0}
.existing-list ul{list-style:none;padding:0;margin:0 0 12px 0;max-height:220px;overflow:auto}
.pl-item{display:flex;align-items:center;gap:12px;padding:8px;width:100%;border-radius:6px;border:1px solid transparent;background:transparent;cursor:pointer}
.pl-item:hover{background:var(--bg-secondary);border-color:var(--border-color)}
.pl-thumb{width:72px;height:56px;object-fit:cover;border-radius:6px;flex-shrink:0}
.pl-name{font-weight:600}
.pl-count{color:var(--text-secondary);margin-left:auto}
.create-new{margin-top:8px;display:flex;gap:8px;align-items:center}
.create-new input{flex:1;padding:8px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-primary);color:var(--text-primary)}
.create-new button{padding:8px 12px;border-radius:6px;border:none;background:var(--accent-color);color:var(--on-accent);cursor:pointer}
.close-btn{margin-top:12px;padding:8px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);cursor:pointer}
</style>
