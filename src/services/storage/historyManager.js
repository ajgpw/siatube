/**
 * IndexedDB を使用した動画履歴管理
 * base64 エンコードされたサムネイルをバイナリに変換して保存
 */
import { arrayBufferToDataUrl, base64ToArrayBuffer } from '../../utils/imageEncoding.js';

const DB_NAME = 'VideoHistory';
const DB_VERSION = 1;
const STORE_NAME = 'videos';

let db = null;

/**
 * IndexedDB の初期化
 */
export async function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      console.log('DB already initialized');
      resolve(db);
      return;
    }

    console.log('Opening IndexedDB...');
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      db = request.result;
      console.log('IndexedDB opened successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log('Upgrading DB schema...');
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('Store created');
      }
    };
  });
}

/**
 * 動画情報を履歴に追加（既存の場合は更新）
 * @param {Object} videoData - { id, title, views, author.name, description.run0, thumbnail }
 */
export async function addVideoToHistory(videoData) {
  try {
    await initDB();

    const record = {
      id: videoData.id,
      title: videoData.title || '',
      views: videoData.views || 0,
      authorName: videoData.author?.name || '',
      description: videoData.description?.run0 || '',
      thumbnailBinary: base64ToArrayBuffer(videoData.thumbnail),
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(record);
    });
  } catch (error) {
    console.error('Failed to add video to history:', error);
    throw error;
  }
}

/**
 * 履歴から全ての動画を取得（タイムスタンプの新しい順）
 * @returns {Promise<Array>} - 表示用に変換された動画データの配列
 */
export async function getHistoryVideos() {
  try {
    console.log('getHistoryVideos called');
    await initDB();
    console.log('DB initialized');

    return new Promise((resolve, reject) => {
      console.log('Starting transaction...');
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onerror = () => {
        console.error('getAll error:', request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log('getAll success, records count:', request.result.length);
        const records = request.result;
        // タイムスタンプの新しい順にソート
        records.sort((a, b) => b.timestamp - a.timestamp);

        // ArrayBuffer を base64 に変換して返す
        const videos = records.map((record) => {
          console.log('Converting record:', record.id);
          return {
            id: record.id,
            title: record.title,
            views: record.views,
            authorName: record.authorName,
            description: record.description,
            thumbnail: arrayBufferToDataUrl(record.thumbnailBinary),
            timestamp: record.timestamp,
          };
        });

        console.log('Resolved videos:', videos);
        resolve(videos);
      };
    });
  } catch (error) {
    console.error('Failed to get history videos:', error);
    throw error;
  }
}

/**
 * 特定の動画を履歴から削除
 * @param {string} videoId
 */
export async function removeVideoFromHistory(videoId) {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(videoId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to remove video from history:', error);
    throw error;
  }
}

/**
 * 履歴をクリア（全ての動画を削除）
 */
export async function clearHistory() {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.error('Failed to clear history:', error);
    throw error;
  }
}

/**
 * 履歴内の動画数を取得
 */
export async function getHistoryCount() {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('Failed to get history count:', error);
    throw error;
  }
}
