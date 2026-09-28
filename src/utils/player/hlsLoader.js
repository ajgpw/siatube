let hlsConstructorPromise = null;

export function isMseHlsSupported() {
  try {
    const mediaSource = globalThis.MediaSource;
    return Boolean(
      mediaSource &&
      typeof mediaSource.isTypeSupported === "function" &&
      mediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"')
    );
  } catch {
    return false;
  }
}

export function loadHlsConstructor() {
  if (!hlsConstructorPromise) {
    hlsConstructorPromise = import("hls.js/light").then((module) => module.default);
  }
  return hlsConstructorPromise;
}
