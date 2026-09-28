/**
 * Decode a base64 thumbnail or data URL for storage in IndexedDB.
 * Missing or unreadable thumbnails retain the existing null fallback.
 * @param {string} base64String
 * @returns {ArrayBuffer | null}
 */
export function base64ToArrayBuffer(base64String) {
  if (!base64String) return null;

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
