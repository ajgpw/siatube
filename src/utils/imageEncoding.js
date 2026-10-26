/**
 * Decode a base64 thumbnail or data URL for storage in IndexedDB.
 * Missing or unreadable thumbnails retain the existing null fallback.
 * @param {string} base64String
 * @returns {ArrayBuffer | null}
 */
export function base64ToArrayBuffer(base64String) {
  if (!base64String) return null;
  if (typeof base64String !== 'string' ||
      /^(?:https?:|blob:|\/\/)/i.test(base64String) ||
      /^[A-Za-z0-9_-]{11}$/.test(base64String)) return null;

  try {
    const base64 = base64String.includes(',')
      ? base64String.split(',')[1]
      : base64String;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch {
    return null;
  }
}

/** Keep binary thumbnails compatible while preserving URL or video ID sources. */
export function thumbnailStorageFields(value) {
  const thumbnailBinary = base64ToArrayBuffer(value);
  return {
    thumbnailBinary,
    thumbnailSource: thumbnailBinary === null && typeof value === 'string' ? value : null,
  };
}

export function storedThumbnailValue(record) {
  return record?.thumbnailSource || arrayBufferToDataUrl(record?.thumbnailBinary);
}

/**
 * Convert a stored thumbnail into a browser image source.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} mimeType
 * @returns {string | null}
 */
export function arrayBufferToDataUrl(arrayBuffer, mimeType = 'image/jpeg') {
  if (!arrayBuffer) return null;

  try {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    // Avoid spreading image bytes into function arguments: large images can
    // exceed the browser's argument limit.
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}
