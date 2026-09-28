/**
 * ISO 8601形式の動画時間をMM:SSまたはHH:MM:SS形式に変換
 */
export function formatDuration(input) {
  if (!input) return "";

  const isoMatch = input.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  const pad = (n) => n.toString().padStart(2, "0");

  if (isoMatch) {
    const [h, m, s] = isoMatch.slice(1).map((v) => parseInt(v || "0"));
    const totalSeconds = h * 3600 + m * 60 + s;
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;
    return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
  }

  const timeParts = input.split(":");
  const isValidTimeParts = timeParts.every((part) => /^\d+$/.test(part));

  if (timeParts.length === 2 && isValidTimeParts) {
    const [mm, ss] = timeParts;
    return `${parseInt(mm)}:${pad(parseInt(ss))}`;
  } else if (timeParts.length === 3 && isValidTimeParts) {
    const [hh, mm, ss] = timeParts;
    return `${parseInt(hh)}:${pad(parseInt(mm))}:${pad(parseInt(ss))}`;
  }

  return "";
}

/**
 * 公開日時を相対時間表記に変換（例：「5時間前」）
 */
export function formatPublishedAt(input) {
  if (!input) return "不明";

  const isoDate = new Date(input);
  if (!isNaN(isoDate.getTime())) {
    const now = new Date();
    const diffMs = now - isoDate;
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days === 1) return "1日前";
    return `${days}日前`;
  }

  const relativeTimePattern = /^\d+(?:日|時間|分)前$|^たった今$/;
  if (relativeTimePattern.test(input)) {
    return input;
  }

  return input;
}

/**
 * 再生回数をフォーマット（例：「125万」「1.5億」）
 */
export function formatViewCount(num) {
  if (!num) return "0";
  if (num < 10000) return num.toLocaleString();
  if (num < 100000000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, "") + "万";
  }
  return (num / 100000000).toFixed(1).replace(/\.0$/, "") + "億";
}

/**
 * YouTube動画のサムネイル画像URLを取得
 */
export function getPrimaryThumbnail(id) {
  return `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
}
