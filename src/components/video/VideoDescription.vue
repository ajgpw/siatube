<template>
  <div class="video-description" ref="descTop">
    <div v-if="!localShowFull" class="description-preview">
      <p v-if="descriptionRun0">{{ descriptionRun0 }}</p>
      <p v-if="descriptionRun1">{{ descriptionRun1 }}</p>
    </div>

    <div
      v-else
      class="description-full"
      v-html="formattedDescription"
    ></div>

    <span
      class="description-toggle"
      role="button"
      tabindex="0"
      @click="toggle"
      @keydown.enter="toggle"
      @keydown.space.prevent="toggle"
    >
      {{ localShowFull ? "一部を表示" : "...もっと見る" }}
    </span>
  </div>
</template>

<script>
export default {
  name: "VideoDescription",
  props: {
    descriptionRun0: { type: String, default: "" },
    descriptionRun1: { type: String, default: "" },
    formattedDescription: { type: String, default: "" },
    showFull: { type: Boolean, default: false },
  },
  emits: ["toggle"],
  data() {
    return {
      localShowFull: this.showFull,
      scrollAnimationFrame: null,
    };
  },
  watch: {
    showFull(v) {
      this.localShowFull = v;
    },
  },
  beforeUnmount() {
    if (this.scrollAnimationFrame !== null) {
      cancelAnimationFrame(this.scrollAnimationFrame);
    }
  },
  methods: {
    toggle() {
      this.localShowFull = !this.localShowFull;
      this.$emit("toggle", this.localShowFull);

      this.$nextTick(() => {
        // 「一部を表示」に戻したときだけ概要欄の先頭へスクロール
        if (!this.localShowFull) {
          const el = this.$refs.descTop;
          this.scrollToDescription(el);
        }
      });
    },

    scrollToDescription(element) {
      if (!element) return;
      if (this.scrollAnimationFrame !== null) {
        cancelAnimationFrame(this.scrollAnimationFrame);
      }

      const startY = window.scrollY;
      const rect = element.getBoundingClientRect();
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const targetY = Math.min(maxY, Math.max(0, startY + rect.top));
      const distance = targetY - startY;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || Math.abs(distance) < 1) {
        window.scrollTo(0, targetY);
        this.scrollAnimationFrame = null;
        return;
      }

      const duration = Math.min(800, Math.max(300, Math.abs(distance) / 0.8));
      const startedAt = performance.now();
      const animate = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = (1 - Math.cos(Math.PI * progress)) / 2;
        window.scrollTo(0, startY + distance * eased);
        if (progress < 1) {
          this.scrollAnimationFrame = requestAnimationFrame(animate);
        } else {
          this.scrollAnimationFrame = null;
        }
      };
      this.scrollAnimationFrame = requestAnimationFrame(animate);
    },
  },
};
</script>

<style scoped>
.video-description {
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.5;
  margin-top: 12px;
  margin-bottom: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-anchor: none;
}

.description-preview {
  max-height: 120px;
  overflow: hidden;
  margin: 0 0 0.4em 0;
}

.description-full {
  margin: 0;
}

.description-toggle {
  display: inline-block;
  color: var(--accent-color);
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
  user-select: none;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  margin-top: 4px;
}
</style>
