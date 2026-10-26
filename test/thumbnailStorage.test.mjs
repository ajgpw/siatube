import test from 'node:test';
import assert from 'node:assert/strict';
import { addVideoToHistory, getHistoryVideos } from '../src/services/storage/historyManager.js';
import {
  addVideoToPlaylist,
  createPlaylist,
  getPlaylistById,
  getPlaylists,
} from '../src/services/storage/playlistManager.js';
import {
  __resetThumbnailSourceForTests,
  resolveThumbnailSource,
} from '../src/services/network/thumbnailSource.js';
import {
  __resetGuardSessionForTests,
  saveGuardSession,
} from '../src/services/guard/guard-session.js';

// Model IndexedDB's asynchronous requests and cloned records so reads cannot
// accidentally mutate the persisted thumbnail source.
function memoryIndexedDB() {
  const databases = new Map();
  function request(operation) {
    const pending = {};
    queueMicrotask(() => {
      try {
        pending.result = operation();
        pending.onsuccess?.();
      } catch (error) {
        pending.error = error;
        pending.onerror?.();
      }
    });
    return pending;
  }
  return {
    databases,
    open(name) {
      if (!databases.has(name)) databases.set(name, new Map());
      const records = databases.get(name);
      const store = {
        add: (value) => request(() => {
          const id = records.size + 1;
          records.set(id, structuredClone({ id, ...value }));
          return id;
        }),
        put: (value) => request(() => {
          records.set(value.id, structuredClone(value));
          return value.id;
        }),
        get: (id) => request(() => structuredClone(records.get(id))),
        getAll: () => request(() => structuredClone([...records.values()])),
        index: () => store,
      };
      return request(() => ({ transaction: () => ({ objectStore: () => store }) }));
    },
  };
}

test('history and local playlists retain URL thumbnails, proxy identities, and legacy images without fetching', async (t) => {
  const previousIndexedDB = globalThis.indexedDB;
  const previousFetch = globalThis.fetch;
  const previousImage = globalThis.Image;
  const indexedDB = memoryIndexedDB();
  globalThis.indexedDB = indexedDB;
  globalThis.fetch = () => { throw new Error('Saving a thumbnail must not fetch it'); };
  t.after(() => {
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
    globalThis.fetch = previousFetch;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    __resetThumbnailSourceForTests();
    __resetGuardSessionForTests();
  });

  const videoId = 'dQw4w9WgXcQ';
  const oldSession = 'S'.repeat(43);
  const proxy = `https://siatube-web.online?token=${videoId}&guard_sid=${oldSession}`;
  const youtube = `https://img.youtube.com/vi/${videoId}/sddefault.jpg`;
  const dataUrl = 'data:image/jpeg;base64,AAF/gP7/';
  const samples = [
    { id: 'base64', thumbnail: dataUrl },
    { id: 'youtube', thumbnail: youtube },
    { id: 'proxy', thumbnail: proxy },
  ];
  for (const sample of samples) await addVideoToHistory(sample);

  const historyRecords = indexedDB.databases.get('VideoHistory');
  assert.ok(historyRecords.get('base64').thumbnailBinary instanceof ArrayBuffer);
  assert.equal(historyRecords.get('youtube').thumbnailSource, youtube);
  assert.equal(historyRecords.get('youtube').thumbnailBinary, null);
  assert.equal(historyRecords.get('proxy').thumbnailSource, videoId);
  assert.equal(JSON.stringify([...historyRecords.values()]).includes(oldSession), false);
  const history = await getHistoryVideos();
  assert.equal(history.find((item) => item.id === 'base64').thumbnail, dataUrl);
  assert.equal(history.find((item) => item.id === 'youtube').thumbnail, youtube);
  assert.equal(history.find((item) => item.id === 'proxy').thumbnail, resolveThumbnailSource(videoId));

  const playlist = await createPlaylist('URL images', proxy);
  for (const sample of samples) await addVideoToPlaylist(playlist.id, sample);
  const persisted = indexedDB.databases.get('PlaylistsDB').get(playlist.id);
  assert.equal(persisted.thumbnailSource, videoId);
  assert.equal(persisted.items.find((item) => item.id === 'proxy').thumbnailSource, videoId);
  assert.equal(JSON.stringify(persisted).includes(oldSession), false);
  const loaded = await getPlaylistById(playlist.id);
  assert.equal(loaded.thumbnail, resolveThumbnailSource(videoId));
  assert.equal(loaded.items.find((item) => item.id === 'base64').thumbnail, dataUrl);
  assert.equal(loaded.items.find((item) => item.id === 'youtube').thumbnail, youtube);
  assert.equal(loaded.items.find((item) => item.id === 'proxy').thumbnail, resolveThumbnailSource(videoId));
  assert.deepEqual((await getPlaylists())[0].items, loaded.items);

  // Records written before thumbnailSource existed still display correctly.
  delete persisted.items[0].thumbnailSource;
  assert.equal((await getPlaylistById(playlist.id)).items[0].thumbnail, dataUrl);

  // Opening local pages directly must detect a blocked YouTube host and use
  // the current authenticated proxy session, without a preceding API request.
  globalThis.Image = class {
    naturalWidth = 1;
    naturalHeight = 1;
    set src(value) {
      queueMicrotask(() => {
        if (new URL(value).hostname === 'img.youtube.com') this.onerror?.();
        else this.onload?.();
      });
    }
    removeAttribute() {}
  };
  __resetThumbnailSourceForTests();
  const saveSession = (sessionId) => saveGuardSession({
    version: 1,
    sessionId,
    expiresAt: Date.now() + 60_000,
    verifiedUntil: Date.now() + 60_000,
  });
  saveSession('A'.repeat(43));
  const directHistory = await getHistoryVideos();
  const historyImage = new URL(directHistory.find((item) => item.id === 'proxy').thumbnail);
  assert.equal(historyImage.origin, 'https://siatube-web.online');
  assert.equal(historyImage.searchParams.get('guard_sid'), 'A'.repeat(43));

  saveSession('R'.repeat(43));
  const refreshedPlaylist = await getPlaylistById(playlist.id);
  assert.equal(new URL(refreshedPlaylist.thumbnail).searchParams.get('guard_sid'), 'R'.repeat(43));
  assert.equal(new URL(refreshedPlaylist.items.find((item) => item.id === 'proxy').thumbnail)
    .searchParams.get('guard_sid'), 'R'.repeat(43));
  assert.equal(persisted.thumbnailSource, videoId);
  assert.equal(persisted.items.find((item) => item.id === 'proxy').thumbnailSource, videoId);
});
