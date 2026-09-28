/**
 * ヘッダー検索設定の管理ロジック（リファクタリング版）
 */

const STORAGE_KEYS = {
  DEFAULT_PLAYBACK: 'defaultPlaybackMode',
  AUTOPLAY_ENABLED: 'yt_autoplay_enabled_v1',
  SHORT_VIDEO_FILTER_ENABLED: 'shortVideoFilterEnabled',
  SHORT_VIDEO_FILTER_MINUTES: 'shortVideoFilterMinutes',
  DARK_MODE: 'darkMode',
  DISPLAY_MODE: 'displayMode',
  DISABLE_TIMEOUTS: 'disableTimeouts',
  PREFERRED_QUALITY: 'preferredQuality',
};

const DEFAULTS = {
  DEFAULT_PLAYBACK_MODE: '1',
  AUTOPLAY_ENABLED: true,
  SHORT_VIDEO_MINUTES: 4,
  PREFERRED_QUALITY: 'auto',
};

export const AUTOPLAY_SETTING_EVENT = 'yt-autoplay-setting-changed';

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`safeSetItem error [${key}]`, e);
  }
}

function safeGetItem(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      // 既存ストレージが生の文字列の場合はそのまま返す
      return raw;
    }
  } catch (e) {
    console.error(`safeGetItem error [${key}]`, e);
    return fallback;
  }
}

function setCookie(name, value, days = 3650) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
  try {
    const pair = document.cookie.split('; ').find((p) => p.startsWith(`${name}=`));
    if (!pair) return null;
    return decodeURIComponent(pair.split('=')[1] || '');
  } catch (e) {
    console.error(`getCookie error [${name}]`, e);
    return null;
  }
}

/**
 * デフォルト再生方式を保存
 * @param {string} mode
 */
export function saveDefaultPlayback(mode) {
  try {
    setCookie('StreamType', mode, 3650); // ほぼ永久
    safeSetItem(STORAGE_KEYS.DEFAULT_PLAYBACK, String(mode));
  } catch (e) {
    console.error('saveDefaultPlayback error', e);
  }
}

/**
 * デフォルト再生方式を読み込み
 * @returns {string}
 */
export function loadDefaultPlayback() {
  try {
    const fromStorage = safeGetItem(STORAGE_KEYS.DEFAULT_PLAYBACK, null);
    if (fromStorage !== null && fromStorage !== undefined && fromStorage !== '') return String(fromStorage);

    const cookieMode = getCookie('StreamType');
    if (cookieMode) {
      safeSetItem(STORAGE_KEYS.DEFAULT_PLAYBACK, String(cookieMode));
      return cookieMode;
    }

    return DEFAULTS.DEFAULT_PLAYBACK_MODE;
  } catch (e) {
    console.error('loadDefaultPlayback error', e);
    return DEFAULTS.DEFAULT_PLAYBACK_MODE;
  }
}

/**
 * 動画の自動再生設定を保存する。
 * 既存のタイプ2が使用していた 1/0 形式を維持する。
 * @param {boolean} enabled
 */
export function saveAutoplay(enabled) {
  const value = !!enabled;
  try {
    localStorage.setItem(STORAGE_KEYS.AUTOPLAY_ENABLED, value ? '1' : '0');
  } catch (e) {
    console.error('saveAutoplay error', e);
  }
  try {
    window.dispatchEvent(new CustomEvent(AUTOPLAY_SETTING_EVENT, {
      detail: { enabled: value },
    }));
  } catch {}
}

/**
 * 動画の自動再生設定を読み込む。デフォルトはオン。
 * @returns {boolean}
 */
export function loadAutoplay() {
  try {
    const stored = safeGetItem(STORAGE_KEYS.AUTOPLAY_ENABLED, null);
    if (stored === null || stored === undefined) {
      return DEFAULTS.AUTOPLAY_ENABLED;
    }
    return stored === true || stored === 1 || stored === '1';
  } catch (e) {
    console.error('loadAutoplay error', e);
    return DEFAULTS.AUTOPLAY_ENABLED;
  }
}

/**
 * 短動画フィルタ設定を保存
 * @param {boolean} enabled
 * @param {number} minutes
 */
export function saveShortVideoFilter(enabled, minutes) {
  try {
    safeSetItem(STORAGE_KEYS.SHORT_VIDEO_FILTER_ENABLED, !!enabled);
    safeSetItem(STORAGE_KEYS.SHORT_VIDEO_FILTER_MINUTES, Number(minutes));

    window.__autoplayDurationFilter = {
      enabled: !!enabled,
      minutes: Number(minutes),
      maxSeconds: Number(minutes) * 60,
    };
    console.log('[settings] saveShortVideoFilter:', window.__autoplayDurationFilter);
  } catch (e) {
    console.error('saveShortVideoFilter error', e);
  }
}

/**
 * 短動画フィルタ設定を読み込み
 * @returns {{enabled: boolean, minutes: number}}
 */
export function loadShortVideoFilter() {
  try {
    const enabled = safeGetItem(STORAGE_KEYS.SHORT_VIDEO_FILTER_ENABLED, null);
    const minutes = safeGetItem(STORAGE_KEYS.SHORT_VIDEO_FILTER_MINUTES, null);

    const result = {
      enabled: enabled !== null ? Boolean(enabled) : false,
      minutes: minutes !== null ? Number(minutes) : DEFAULTS.SHORT_VIDEO_MINUTES,
    };

    window.__autoplayDurationFilter = {
      enabled: result.enabled,
      minutes: result.minutes,
      maxSeconds: result.minutes * 60,
    };

    console.log('[settings] loadShortVideoFilter:', window.__autoplayDurationFilter);
    return result;
  } catch (e) {
    console.error('loadShortVideoFilter error', e);
    return { enabled: false, minutes: DEFAULTS.SHORT_VIDEO_MINUTES };
  }
}

/**
 * 表示モードを保存（'device'|'light'|'dark'）
 * @param {string} mode
 */
export function saveDisplayMode(mode) {
  try {
    const m = String(mode || 'device');
    safeSetItem(STORAGE_KEYS.DISPLAY_MODE, m);
  } catch (e) {
    console.error('saveDisplayMode error', e);
  }
}

/**
 * 表示モードを読み込み。戻り値は 'device'|'light'|'dark' のいずれか。
 * 既存の boolean ベースのストレージ ('darkMode') がある場合は互換性のために変換して返す。
 * デフォルトは 'device'（デバイスに合わせる）。
 */
export function loadDisplayMode() {
  try {
    const stored = safeGetItem(STORAGE_KEYS.DISPLAY_MODE, null);
    if (stored !== null && stored !== undefined && stored !== '') return String(stored);

    // 互換: 古い boolean ベースのキーをチェック
    const legacy = safeGetItem(STORAGE_KEYS.DARK_MODE, null);
    if (legacy !== null && legacy !== undefined) {
      return legacy ? 'dark' : 'light';
    }

    return 'device';
  } catch (e) {
    console.error('loadDisplayMode error', e);
    return 'device';
  }
}

/**
 * タイムアウトを無効化する設定を保存
 * @param {boolean} enabled
 */
export function saveDisableTimeouts(enabled) {
  try {
    safeSetItem(STORAGE_KEYS.DISABLE_TIMEOUTS, !!enabled);
  } catch (e) {
    console.error('saveDisableTimeouts error', e);
  }
}

/**
 * 優先画質を保存
 * @param {string} quality
 */
export function savePreferredQuality(quality) {
  try {
    const q = String(quality || DEFAULTS.PREFERRED_QUALITY);
    safeSetItem(STORAGE_KEYS.PREFERRED_QUALITY, q);
  } catch (e) {
    console.error('savePreferredQuality error', e);
  }
}

/**
 * 優先画質を読み込み
 * @returns {string}
 */
export function loadPreferredQuality() {
  try {
    const stored = safeGetItem(STORAGE_KEYS.PREFERRED_QUALITY, null);
    if (stored !== null && stored !== undefined && stored !== '') return String(stored);
    return DEFAULTS.PREFERRED_QUALITY;
  } catch (e) {
    console.error('loadPreferredQuality error', e);
    return DEFAULTS.PREFERRED_QUALITY;
  }
}

/**
 * タイムアウトを無効化する設定を読み込み
 * デフォルトは true
 * @returns {boolean}
 */
export function loadDisableTimeouts() {
  try {
    const v = safeGetItem(STORAGE_KEYS.DISABLE_TIMEOUTS, null);
    if (v === null || v === undefined) return true;
    return !!v;
  } catch (e) {
    console.error('loadDisableTimeouts error', e);
    return true;
  }
}

/**
 * displayMode から実際にダークモードかどうかを判定する補助関数
 * @param {string} mode
 * @returns {boolean}
 */
export function computeIsDarkFromMode(mode) {
  try {
    const m = String(mode || 'device');
    if (m === 'device') {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
      return false;
    }
    return m === 'dark';
  } catch (e) {
    console.error('computeIsDarkFromMode error', e);
    return false;
  }
}

export default {
  saveDefaultPlayback,
  loadDefaultPlayback,
  saveAutoplay,
  loadAutoplay,
  saveShortVideoFilter,
  loadShortVideoFilter,
  saveDisplayMode,
  loadDisplayMode,
  computeIsDarkFromMode,
  saveDisableTimeouts,
  loadDisableTimeouts,
  savePreferredQuality,
  loadPreferredQuality,
};
