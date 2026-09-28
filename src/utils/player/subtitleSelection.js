// Keep the app's selection authoritative, including Safari's automatic selection.
export function bindSubtitleSelection(video, getSelectedTrack) {
  const sync = () => {
    const selected = getSelectedTrack();
    for (const track of Array.from(video.textTracks || [])) {
      if (track.kind !== 'subtitles' && track.kind !== 'captions') continue;
      const mode = track === selected ? 'showing' : 'disabled';
      if (track.mode !== mode) track.mode = mode;
    }
  };
  const events = ['loadedmetadata', 'loadeddata', 'canplay', 'play'];
  for (const event of events) video.addEventListener(event, sync);
  // Track load does not bubble; capture it from the video element.
  video.addEventListener('load', sync, true);
  video.textTracks?.addEventListener('addtrack', sync);
  video.textTracks?.addEventListener('change', sync);
  sync();
  return {
    sync,
    dispose() {
      for (const event of events) video.removeEventListener(event, sync);
      video.removeEventListener('load', sync, true);
      video.textTracks?.removeEventListener('addtrack', sync);
      video.textTracks?.removeEventListener('change', sync);
    },
  };
}
