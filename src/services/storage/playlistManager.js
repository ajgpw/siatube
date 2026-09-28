/**
 * プレイリスト管理（IndexedDB）
 */
import { arrayBufferToDataUrl, base64ToArrayBuffer } from '../../utils/imageEncoding.js';

const DB_NAME = 'PlaylistsDB';
const DB_VERSION = 1;
const STORE_PLAYLISTS = 'playlists';

let db = null;

export async function initPlaylistsDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_PLAYLISTS)) {
        const store = database.createObjectStore(STORE_PLAYLISTS, { keyPath: 'id', autoIncrement: true });
        store.createIndex('name', 'name', { unique: false });
      }
    };
  });
}

export async function createPlaylist(name, thumbnailBase64 = null) {
  await initPlaylistsDB();
  const thumbnailBinary = base64ToArrayBuffer(thumbnailBase64);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readwrite');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const record = { name, thumbnailBinary, items: [], createdAt: Date.now() };
    const req = store.add(record);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve({ id: req.result, ...record });
  });
}

export async function getPlaylists() {
  await initPlaylistsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readonly');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const req = store.getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const list = req.result.map(r => ({
        id: r.id,
        name: r.name,
        thumbnail: arrayBufferToDataUrl(r.thumbnailBinary),
        items: r.items || [],
        createdAt: r.createdAt,
      }));
      resolve(list);
    };
  });
}

export async function addVideoToPlaylist(playlistId, videoData) {
  await initPlaylistsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readwrite');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const getReq = store.get(playlistId);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (!rec) return reject(new Error('Playlist not found'));
      // prepare item
      const item = {
        id: videoData.id,
        title: videoData.title || '',
        authorName: videoData.author?.name || '',
        views: videoData.views || 0,
        description: videoData.description?.run0 || '',
        timestamp: Date.now(),
      };
      // thumbnail binary
      if (videoData.thumbnail) {
        const bin = base64ToArrayBuffer(videoData.thumbnail);
        item.thumbnailBinary = bin;
      }
      rec.items = rec.items || [];
      // prevent duplicates by id
      rec.items = rec.items.filter(it => it.id !== item.id);
      rec.items.push(item);
      const putReq = store.put(rec);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => resolve(item);
    };
  });
}

export async function getPlaylistById(id) {
  await initPlaylistsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readonly');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const req = store.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const r = req.result;
      if (!r) return resolve(null);
      resolve({
        id: r.id,
        name: r.name,
        thumbnail: arrayBufferToDataUrl(r.thumbnailBinary),
        items: r.items || [],
        createdAt: r.createdAt,
      });
    };
  });
}

export async function deletePlaylist(id) {
  await initPlaylistsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readwrite');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const req = store.delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
  });
}

export async function removeVideoFromPlaylist(playlistId, videoId) {
  await initPlaylistsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PLAYLISTS], 'readwrite');
    const store = tx.objectStore(STORE_PLAYLISTS);
    const getReq = store.get(playlistId);
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (!rec) return reject(new Error('Playlist not found'));
      rec.items = (rec.items || []).filter(i => i.id !== videoId);
      const putReq = store.put(rec);
      putReq.onerror = () => reject(putReq.error);
      putReq.onsuccess = () => resolve();
    };
  });
}
