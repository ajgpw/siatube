<template>
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path :d="paths[name] || paths.play" />
  </svg>
</template>

<script setup>
defineProps({ name: { type: String, default: 'play' } });
const paths = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  replay: 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
  volume: 'M3 9v6h4l5 4V5L7 9H3zm11-1v8a5 5 0 0 0 0-8zm0-4v2a7 7 0 0 1 0 12v2a9 9 0 0 0 0-16z',
  muted: 'M3 9v6h4l5 4V5L7 9H3zm12-1-1 1 3 3-3 3 1 1 3-3 3 3 1-1-3-3 3-3-1-1-3 3z',
  settings: 'm19.4 13 .1-1-.1-1 2-1.5-2-3.5-2.3 1a8 8 0 0 0-1.7-1L15 3h-4l-.5 3a8 8 0 0 0-1.7 1l-2.3-1-2 3.5 2 1.5-.1 1 .1 1-2 1.5 2 3.5 2.3-1a8 8 0 0 0 1.7 1l.5 3h4l.5-3a8 8 0 0 0 1.7-1l2.3 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  captions: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm6 6V8H5v8h5v-2H7v-4zm9 0V8h-5v8h5v-2h-3v-4z',
  pip: 'M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h16V5zm7 6h7v6h-7z',
  fullscreen: 'M3 3h6v2H5v4H3zm12 0h6v6h-2V5h-4zM3 15h2v4h4v2H3zm16 0h2v6h-6v-2h4z',
  exitFullscreen: 'M7 3h2v6H3V7h4zm8 0h2v4h4v2h-6zM3 15h6v6H7v-4H3zm12 0h6v2h-4v4h-2z',
  close: 'm6 4 6 6 6-6 2 2-6 6 6 6-2 2-6-6-6 6-2-2 6-6-6-6z',
};
</script>
