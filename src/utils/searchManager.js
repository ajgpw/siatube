/**
 * 検索機能の管理ロジック
 */

import { suggest } from "@/services/api/siatubeApi.js";

/**
 * SiaTube API から検索候補を取得
 */
export async function fetchSearchSuggestions(keyword, signal) {
  if (!keyword) return [];

  try {
    const data = await suggest(keyword, { signal });
    return Array.isArray(data) ? data.filter((item) => typeof item === "string") : [];
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('fetchSearchSuggestions error', e);
    }
    return [];
  }
}

/**
 * 選択インデックスを移動
 */
export function moveSelectionIndex(current, delta, total) {
  if (total === 0) return -1;

  let next = current + delta;
  if (next < 0) next = total - 1;
  if (next >= total) next = 0;

  return next;
}
