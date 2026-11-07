<template>
  <div
    ref="root"
    class="type2-controls"
    :class="{ 'controls-hidden': !controlsShown, 'settings-open': settingsOpen }"
    role="region"
    aria-label="動画プレイヤー"
    tabindex="0"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
    @pointerdown="keyboardFocus = false"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @keydown="onKeydown"
  >
    <div
      class="player-hit-area"
      aria-hidden="true"
      @click="onSurfaceClick"
      @dblclick.prevent="onSurfaceDoubleClick"
      @pointerup="onSurfaceTouch"
    ></div>

    <button v-if="unmutePrompt && controlsShown" type="button" class="player-unmute" @click.stop="$emit('unmute')">
      <PlayerControlIcon name="muted" /> ミュートを解除
    </button>

    <div v-if="audioOnly" class="audio-backdrop" aria-hidden="true">
      <span class="audio-disc">♪</span><span>音声のみ</span>
    </div>

    <Transition name="player-feedback">
      <div v-if="feedback" :key="feedbackKey" class="player-feedback" aria-hidden="true">
        <PlayerControlIcon v-if="feedback === 'play' || feedback === 'pause'" :name="feedback" />
        <span v-else>{{ feedback }}</span>
      </div>
    </Transition>

    <Transition name="player-center">
      <button
        v-if="controlsShown && !isPlaying && !buffering"
        type="button"
        class="center-play"
        :aria-label="ended ? 'もう一度再生' : '再生'"
        @click.stop="togglePlayback"
      ><PlayerControlIcon :name="ended ? 'replay' : 'play'" /></button>
      <button
        v-else-if="touchMode && controlsShown && !buffering && !settingsOpen"
        type="button"
        class="center-play touch-pause"
        aria-label="一時停止"
        @click.stop="togglePlayback"
      ><PlayerControlIcon name="pause" /></button>
    </Transition>

    <div v-if="buffering && isPlaying" class="player-buffering" role="status" aria-label="読み込み中"></div>

    <div class="player-chrome" :inert="!controlsShown">
      <Transition name="player-menu">
        <section v-if="settingsOpen" :id="settingsId" ref="settingsPanel" class="player-settings-menu" aria-label="再生設定" @keydown.esc.stop="closeSettings" @click.stop>
          <header>
            <strong>再生設定</strong>
            <button type="button" class="control-button menu-close" aria-label="設定を閉じる" @click="closeSettings"><PlayerControlIcon name="close" /></button>
          </header>
          <div class="player-settings-content"><slot name="settings" /></div>
        </section>
      </Transition>

      <div v-if="statusMessage" class="player-status" role="status">{{ statusMessage }}</div>

      <div class="player-bottom">
        <div class="player-timeline" :class="{ scrubbing: dragging, 'timeline-disabled': !canSeek }" @pointermove="onTimelineHover" @pointerleave="hoverTime = null">
          <div class="timeline-track">
            <span v-for="(range, index) in bufferedRanges" :key="index" class="timeline-buffered" :style="{ left: `${range.left}%`, width: `${range.width}%` }"></span>
            <span class="timeline-played" :style="{ width: `${progressPercent}%` }"></span>
            <span class="timeline-thumb" :style="{ left: `${progressPercent}%` }"></span>
          </div>
          <input
            class="timeline-input"
            type="range"
            aria-label="再生位置"
            :aria-valuetext="`${formatTime(displayTime)} / ${formatTime(timelineEnd)}`"
            :min="timelineStart"
            :max="timelineEnd || 1"
            step="0.1"
            :value="displayTime"
            :disabled="!canSeek"
            @pointerdown="beginScrub"
            @input="previewSeek"
            @change="commitSeek"
            @pointercancel="cancelScrub"
            @lostpointercapture="cancelScrub"
            @blur="cancelScrub"
          />
          <div v-if="canSeek && (hoverTime !== null || dragging)" class="timeline-preview" :style="{ left: `${previewPercent}%` }">{{ formatTime(dragging ? scrubTime : hoverTime) }}</div>
        </div>

        <div class="player-toolbar">
          <button type="button" class="control-button" :aria-label="playLabel" :data-tooltip="playLabel" @click="togglePlayback">
            <PlayerControlIcon :name="ended ? 'replay' : isPlaying ? 'pause' : 'play'" />
          </button>
          <div class="player-volume">
            <button type="button" class="control-button" :aria-label="muted || volume === 0 ? 'ミュート解除 (m)' : 'ミュート (m)'" :data-tooltip="muted || volume === 0 ? 'ミュート解除 (m)' : 'ミュート (m)'" @click="toggleMute">
              <PlayerControlIcon :name="muted || volume === 0 ? 'muted' : 'volume'" />
            </button>
            <div class="volume-slider-wrap">
              <input type="range" class="volume-slider" aria-label="音量" min="0" max="1" step="0.05" :value="muted ? 0 : volume" :style="{ '--volume': `${muted ? 0 : volume * 100}%` }" @input="setVolume(Number($event.target.value))" />
            </div>
          </div>
          <span class="player-time"><span>{{ formatTime(displayTime) }}</span><span class="time-separator"> / </span><span v-if="!isLive">{{ formatTime(duration) }}</span><span v-else class="live-label">ライブ</span></span>
          <div class="toolbar-spacer"></div>
          <button v-if="captionsAvailable" type="button" class="control-button captions-button" :class="{ active: captionsEnabled }" aria-label="字幕 (c)" :aria-pressed="captionsEnabled" data-tooltip="字幕 (c)" @click="$emit('toggle-captions')"><PlayerControlIcon name="captions" /></button>
          <button ref="settingsButton" type="button" class="control-button settings-button" :class="{ active: settingsOpen }" aria-label="再生設定" :aria-expanded="settingsOpen" :aria-controls="settingsId" data-tooltip="設定" @click="toggleSettings"><PlayerControlIcon name="settings" /></button>
          <button v-if="!audioOnly" type="button" class="control-button pip-control" :class="{ active: pipActive }" aria-label="ピクチャインピクチャ" :aria-pressed="pipActive" :disabled="!pipSupported" data-tooltip="ピクチャインピクチャ" @click="$emit('toggle-pip')"><PlayerControlIcon name="pip" /></button>
          <button type="button" class="control-button fullscreen-control" :aria-label="fullscreen ? '全画面を終了 (f)' : '全画面 (f)'" :disabled="!fullscreenSupported" :data-tooltip="fullscreen ? '全画面を終了 (f)' : '全画面 (f)'" @click="toggleFullscreen"><PlayerControlIcon :name="fullscreen ? 'exitFullscreen' : 'fullscreen'" /></button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import PlayerControlIcon from './PlayerControlIcon.vue';

const props = defineProps({
  media: { type: Object, default: null },
  playbackIntent: { type: Boolean, default: null },
  buffering: { type: Boolean, default: false },
  audioOnly: { type: Boolean, default: false },
  captionsAvailable: { type: Boolean, default: false },
  captionsEnabled: { type: Boolean, default: false },
  pipSupported: { type: Boolean, default: false },
  pipActive: { type: Boolean, default: false },
  unmutePrompt: { type: Boolean, default: false },
});
const emit = defineEmits(['play', 'pause', 'toggle-captions', 'toggle-pip', 'unmute', 'volume-change']);
const root = ref(null);
const settingsButton = ref(null);
const settingsPanel = ref(null);
const settingsId = `player-settings-${useId()}`;
const visible = ref(true);
const settingsOpen = ref(false);
const keyboardFocus = ref(false);
const touchMode = ref(false);
const paused = ref(true);
const ended = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const timelineStart = ref(0);
const timelineEnd = ref(0);
const bufferedRanges = ref([]);
const volume = ref(1);
const muted = ref(false);
const dragging = ref(false);
const scrubTime = ref(0);
const hoverTime = ref(null);
const fullscreen = ref(false);
const fullscreenSupported = ref(false);
const statusMessage = ref('');
const feedback = ref('');
const feedbackKey = ref(0);
let hideTimer;
let feedbackTimer;
let clickTimer;
let touchTimer;
let lastTouch = null;
let lastTouchTime = 0;
let mediaCleanup = () => {};
let mediaQuery;
let savedVolume = 1;
let savedMuted = null;

const isPlaying = computed(() => props.playbackIntent ?? (!paused.value && !ended.value));
const controlsShown = computed(() => visible.value || settingsOpen.value || dragging.value);
const isLive = computed(() => duration.value === Infinity);
const canSeek = computed(() => timelineEnd.value > timelineStart.value);
const displayTime = computed(() => dragging.value ? scrubTime.value : currentTime.value);
const percent = (time) => canSeek.value ? Math.min(100, Math.max(0, (time - timelineStart.value) / (timelineEnd.value - timelineStart.value) * 100)) : 0;
const progressPercent = computed(() => percent(displayTime.value));
const previewPercent = computed(() => Math.min(96, Math.max(4, percent(dragging.value ? scrubTime.value : hoverTime.value))));
const playLabel = computed(() => ended.value ? 'もう一度再生 (k)' : isPlaying.value ? '一時停止 (k)' : '再生 (k)');

function formatTime(value) {
  const total = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

function clearHideTimer() { clearTimeout(hideTimer); }
function hideControls() {
  if (settingsOpen.value || dragging.value) return;
  // Keep shortcuts on the player when its focused buttons become hidden/inert.
  const focused = document.activeElement;
  if (focused && focused !== root.value && root.value?.contains(focused)) {
    root.value.focus({ preventScroll: true });
  }
  clearHideTimer();
  visible.value = false;
}
function revealControls() {
  visible.value = true;
  clearHideTimer();
  if (settingsOpen.value || dragging.value) return;
  hideTimer = setTimeout(hideControls, 3000);
}
function onPointerMove(event) {
  if (event.pointerType === 'touch') return;
  touchMode.value = false;
  revealControls();
}
function onPointerLeave(event) {
  if (event.pointerType === 'touch') return;
  hideControls();
}
function onFocusIn(event) {
  if (event.target.matches(':focus-visible')) { keyboardFocus.value = true; revealControls(); }
}
function onFocusOut(event) {
  if (!root.value?.contains(event.relatedTarget)) {
    keyboardFocus.value = false;
    settingsOpen.value = false;
    if (visible.value) revealControls();
  }
}

function flash(value) {
  clearTimeout(feedbackTimer);
  feedback.value = value;
  feedbackKey.value++;
  feedbackTimer = setTimeout(() => { feedback.value = ''; }, 550);
}
function togglePlayback() {
  if (!props.media) return;
  revealControls();
  const playing = isPlaying.value;
  emit(playing ? 'pause' : 'play');
  flash(playing ? 'pause' : 'play');
}
function onSurfaceClick(event) {
  if (Date.now() - lastTouchTime < 700 || event.pointerType === 'touch') return;
  if (settingsOpen.value) { closeSettings(false); return; }
  clearTimeout(clickTimer);
  clickTimer = setTimeout(togglePlayback, 220);
}
function onSurfaceDoubleClick(event) {
  clearTimeout(clickTimer);
  if (Date.now() - lastTouchTime < 700 || event.pointerType === 'touch') return;
  void toggleFullscreen();
}
function onSurfaceTouch(event) {
  if (event.pointerType !== 'touch') return;
  touchMode.value = true;
  lastTouchTime = Date.now();
  const bounds = root.value.getBoundingClientRect();
  const side = event.clientX - bounds.left < bounds.width / 2 ? -1 : 1;
  if (lastTouch && lastTouch.side === side && Date.now() - lastTouch.time < 300) {
    clearTimeout(touchTimer);
    lastTouch = null;
    seekBy(side * 10);
    return;
  }
  lastTouch = { time: Date.now(), side };
  if (!controlsShown.value) revealControls();
  else if (settingsOpen.value) closeSettings(false);
  else touchTimer = setTimeout(() => {
    hideControls();
    lastTouch = null;
  }, 300);
}

function seekTo(time) {
  if (!props.media || !canSeek.value || !Number.isFinite(time)) return;
  props.media.currentTime = Math.max(timelineStart.value, Math.min(time, timelineEnd.value));
  currentTime.value = props.media.currentTime;
  revealControls();
}
function seekBy(delta) {
  if (!canSeek.value) return;
  seekTo((props.media?.currentTime || 0) + delta);
  flash(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}秒`);
}
function beginScrub() { dragging.value = true; scrubTime.value = currentTime.value; }
function previewSeek(event) {
  scrubTime.value = Number(event.target.value);
  if (!dragging.value) seekTo(scrubTime.value);
}
function commitSeek(event) { seekTo(Number(event.target.value)); dragging.value = false; }
function cancelScrub() { dragging.value = false; }
function onTimelineHover(event) {
  if (!canSeek.value || event.pointerType === 'touch') return;
  const bounds = event.currentTarget.getBoundingClientRect();
  hoverTime.value = timelineStart.value + Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * (timelineEnd.value - timelineStart.value);
}
function setVolume(value) {
  if (!props.media) return;
  props.media.volume = Math.max(0, Math.min(1, value));
  props.media.muted = value === 0;
  syncVolume();
  emit('volume-change', { volume: volume.value, muted: muted.value });
  revealControls();
}
function toggleMute() {
  if (!props.media) return;
  if (props.media.muted || props.media.volume === 0) {
    props.media.muted = false;
    if (props.media.volume === 0) props.media.volume = savedVolume || 1;
  } else props.media.muted = true;
  syncVolume();
  emit('volume-change', { volume: volume.value, muted: muted.value });
  revealControls();
}
function syncVolume() {
  if (!props.media) return;
  volume.value = props.media.volume;
  muted.value = props.media.muted;
  if (volume.value > 0) savedVolume = volume.value;
  savedMuted = muted.value;
}

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value;
  revealControls();
  if (settingsOpen.value && keyboardFocus.value) nextTick(() => settingsPanel.value?.querySelector('button, select, input')?.focus());
}
function closeSettings(restoreFocus = true) {
  settingsOpen.value = false;
  if (restoreFocus) settingsButton.value?.focus();
  revealControls();
}
function fullscreenTarget() { return root.value?.parentElement; }
function syncFullscreen() {
  fullscreen.value = (document.fullscreenElement || document.webkitFullscreenElement) === fullscreenTarget();
  revealControls();
}
async function toggleFullscreen() {
  const target = fullscreenTarget();
  if (!target || !fullscreenSupported.value) return;
  settingsOpen.value = false;
  statusMessage.value = '';
  try {
    if (fullscreen.value) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await document.webkitExitFullscreen();
    } else if (target.requestFullscreen) await target.requestFullscreen();
    else await target.webkitRequestFullscreen();
    syncFullscreen();
  } catch {
    statusMessage.value = '全画面に切り替えられませんでした。';
  }
}
function onKeydown(event) {
  if (event.target.matches('input, select, textarea') || event.target.isContentEditable || event.altKey || event.ctrlKey || event.metaKey) return;
  // Native button activation owns Space/Enter so an action is never applied twice.
  if (event.target.closest('button') && (event.key === ' ' || event.key === 'Enter')) return;
  const key = event.key.toLowerCase();
  const actions = {
    ' ': togglePlayback, k: togglePlayback, m: toggleMute, f: toggleFullscreen,
    arrowleft: () => seekBy(-5), arrowright: () => seekBy(5),
    j: () => seekBy(-10), l: () => seekBy(10),
    arrowup: () => setVolume((muted.value ? 0 : volume.value) + 0.05),
    arrowdown: () => setVolume((muted.value ? 0 : volume.value) - 0.05),
    home: () => seekTo(timelineStart.value), end: () => seekTo(timelineEnd.value),
    c: () => { if (props.captionsAvailable) emit('toggle-captions'); },
    escape: () => { if (settingsOpen.value) closeSettings(); },
  };
  if (!actions[key]) return;
  event.preventDefault();
  keyboardFocus.value = true;
  actions[key]();
  revealControls();
}

function syncMedia() {
  const media = props.media;
  paused.value = !media || media.paused;
  ended.value = !!media?.ended;
  currentTime.value = media?.currentTime || 0;
  duration.value = media?.duration || 0;
  timelineStart.value = 0;
  timelineEnd.value = Number.isFinite(duration.value) ? duration.value : 0;
  if (duration.value === Infinity && media?.seekable?.length) {
    timelineStart.value = media.seekable.start(0);
    timelineEnd.value = media.seekable.end(media.seekable.length - 1);
  }
  const ranges = [];
  if (media?.buffered && canSeek.value) {
    for (let index = 0; index < media.buffered.length; index++) {
      const left = percent(media.buffered.start(index));
      ranges.push({ left, width: percent(media.buffered.end(index)) - left });
    }
  }
  bufferedRanges.value = ranges;
}

watch(() => props.media, (media) => {
  mediaCleanup();
  cancelScrub();
  settingsOpen.value = false;
  statusMessage.value = '';
  if (media) {
    // Preserve user volume/mute choices when a quality change replaces the element.
    media.volume = volume.value;
    if (savedMuted !== null) media.muted = savedMuted;
    const events = ['play', 'pause', 'playing', 'ended', 'timeupdate', 'durationchange', 'loadedmetadata', 'progress', 'emptied', 'seeking', 'seeked'];
    events.forEach((event) => media.addEventListener(event, syncMedia));
    media.addEventListener('volumechange', syncVolume);
    mediaCleanup = () => {
      events.forEach((event) => media.removeEventListener(event, syncMedia));
      media.removeEventListener('volumechange', syncVolume);
    };
    syncVolume();
  }
  syncMedia();
  revealControls();
}, { immediate: true, flush: 'post' });
watch([isPlaying, settingsOpen, dragging], revealControls);

function updateTouchMode(event) { touchMode.value = event.matches; }
onMounted(() => {
  const target = fullscreenTarget();
  fullscreenSupported.value = !!(target?.requestFullscreen || target?.webkitRequestFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  mediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
  touchMode.value = mediaQuery.matches;
  mediaQuery.addEventListener('change', updateTouchMode);
});
onBeforeUnmount(() => {
  mediaCleanup();
  clearHideTimer();
  [feedbackTimer, clickTimer, touchTimer].forEach(clearTimeout);
  mediaQuery?.removeEventListener('change', updateTouchMode);
  document.removeEventListener('fullscreenchange', syncFullscreen);
  document.removeEventListener('webkitfullscreenchange', syncFullscreen);
});
</script>

<style scoped src="../../styles/type2-player-controls.css"></style>
