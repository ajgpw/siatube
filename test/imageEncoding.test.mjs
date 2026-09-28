import test from 'node:test';
import assert from 'node:assert/strict';
import { arrayBufferToDataUrl, base64ToArrayBuffer } from '../src/utils/imageEncoding.js';

test('decodes raw base64 and image data URLs into the same stored bytes', () => {
  const expected = Uint8Array.from([0, 1, 127, 128, 254, 255]);
  for (const encoded of ['AAF/gP7/', 'data:image/png;base64,AAF/gP7/']) {
    const decoded = base64ToArrayBuffer(encoded);
    assert.ok(decoded instanceof ArrayBuffer);
    assert.deepEqual(new Uint8Array(decoded), expected);
  }
});

test('encodes saved image bytes with JPEG by default and an explicit MIME type', () => {
  const bytes = Uint8Array.from([0, 1, 127, 128, 254, 255]);
  assert.equal(arrayBufferToDataUrl(bytes.buffer), 'data:image/jpeg;base64,AAF/gP7/');
  assert.equal(arrayBufferToDataUrl(bytes.buffer, 'image/png'), 'data:image/png;base64,AAF/gP7/');
  assert.deepEqual(bytes, Uint8Array.from([0, 1, 127, 128, 254, 255]));
});

test('round-trips large thumbnails including every byte value', () => {
  const bytes = Uint8Array.from({ length: 256 * 1024 }, (_, index) => index % 256);
  const encoded = arrayBufferToDataUrl(bytes.buffer);
  assert.ok(encoded.startsWith('data:image/jpeg;base64,'));
  assert.deepEqual(new Uint8Array(base64ToArrayBuffer(encoded)), bytes);
});

test('missing and unreadable thumbnail data retain the null fallback', () => {
  for (const value of [null, undefined, '']) {
    assert.equal(base64ToArrayBuffer(value), null);
    assert.equal(arrayBufferToDataUrl(value), null);
  }
  for (const value of ['not base64!', 'data:image/jpeg;base64,?', 123, {}]) {
    assert.equal(base64ToArrayBuffer(value), null);
  }

  const detached = new ArrayBuffer(4);
  structuredClone(detached, { transfer: [detached] });
  assert.equal(arrayBufferToDataUrl(detached), null);
});

test('empty binary thumbnails remain empty data URLs', () => {
  assert.equal(arrayBufferToDataUrl(new ArrayBuffer(0)), 'data:image/jpeg;base64,');
  assert.equal(base64ToArrayBuffer('data:image/jpeg;base64,').byteLength, 0);
});
