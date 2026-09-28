import imageCompression from '../../vendor/browser-image-compression.js';

async function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const n = bstr.length;
  const u8 = new Uint8Array(n);
  for (let i = 0; i < n; i++) u8[i] = bstr.charCodeAt(i);
  return new File([u8], filename, { type: mime });
}

async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressBase64Image(
  base64Input,
  options = { maxSizeMB: 0.005, maxWidthOrHeight: 120 }
) {
  if (!base64Input.startsWith("data:image/")) {
    base64Input = "data:image/jpeg;base64," + base64Input;
  }

  const file = await dataURLtoFile(base64Input, "in.png");
  const compressedBlob = await imageCompression(file, { ...options, useWebWorker: true });
  const compressedBase64 = await fileToDataURL(compressedBlob);
  return compressedBase64;
}
