import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSubtitleSelection } from '../src/utils/subtitleSelection.js';

function player() {
  const video = new EventTarget();
  const tracks = new EventTarget();
  tracks.items = [
    { kind: 'subtitles', language: 'ja', mode: 'showing' },
    { kind: 'captions', language: 'en', mode: 'disabled' },
    { kind: 'metadata', mode: 'hidden' },
  ];
  tracks[Symbol.iterator] = () => tracks.items[Symbol.iterator]();
  video.textTracks = tracks;
  return video;
}

test('starts off and corrects delayed browser selection and newly added tracks', () => {
  const video = player();
  const binding = bindSubtitleSelection(video, () => null);
  const tracks = video.textTracks.items;
  assert.equal(tracks[0].mode, 'disabled');
  assert.equal(tracks[2].mode, 'hidden');
  for (const event of ['loadedmetadata', 'loadeddata', 'canplay', 'play', 'load']) {
    tracks[0].mode = 'showing';
    video.dispatchEvent(new Event(event));
    assert.equal(tracks[0].mode, 'disabled');
  }
  tracks[1].mode = 'showing';
  video.textTracks.dispatchEvent(new Event('change'));
  assert.equal(tracks[1].mode, 'disabled');
  tracks.push({ kind: 'subtitles', mode: 'showing' });
  video.textTracks.dispatchEvent(new Event('addtrack'));
  assert.equal(tracks[3].mode, 'disabled');
  binding.dispose();
});

test('selects one language, switches languages, turns off, and detaches listeners', () => {
  const video = player();
  const tracks = video.textTracks.items;
  let selected = tracks[1];
  const binding = bindSubtitleSelection(video, () => selected);
  assert.deepEqual(tracks.map(t => t.mode), ['disabled', 'showing', 'hidden']);
  selected = tracks[0];
  binding.sync();
  assert.deepEqual(tracks.map(t => t.mode), ['showing', 'disabled', 'hidden']);
  selected = null;
  binding.sync();
  assert.deepEqual(tracks.map(t => t.mode), ['disabled', 'disabled', 'hidden']);
  binding.dispose();
  tracks[0].mode = 'showing';
  video.textTracks.dispatchEvent(new Event('change'));
  video.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(tracks[0].mode, 'showing');
});
