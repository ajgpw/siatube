<template>
  <section class="comments-section">
    <div class="comments-heading">
      <h2 style="color: var(--text-primary); margin-block-start: 0px;">
        <template v-if="totalCommentCount !== null">
          {{ totalCommentCount }}件のコメント ({{ displayedCommentCount }}件表示中)
        </template>
        <template v-else>コメント</template>
      </h2>
      <select v-model="sort" :disabled="loading" @change="fetchComments()" aria-label="コメントの並び順">
        <option value="top">評価順</option>
        <option value="new">新しい順</option>
      </select>
    </div>

    <!-- ローディング表示 -->
    <p v-if="loading" style="color: var(--text-primary);">コメントを読み込み中...</p>

    <!-- コメントリスト -->
    <ul v-else-if="comments.length > 0" class="comment-list">
      <li v-for="(c, i) in comments" :key="c.id || i" class="comment-item">
        <img
          v-if="c.authorIcon"
          :src="c.authorIcon"
          alt="アイコン"
          class="comment-author-icon"
          width="32"
          height="32"
          loading="lazy"
        />
        <div class="comment-content">
          <div class="comment-header">
            <div class="comment-author">{{ c.author }}</div>
            <span class="comment-meta comment-date">{{ c.date }}</span>
          </div>

          <!-- コメントテキスト -->
          <div
            class="comment-text"
            :class="{ clamped: c.isClamped && !c.isExpanded, expanded: c.isExpanded }"
            :data-index="i"
          >
            {{ c.text }}
          </div>

          <!-- もっと見る / 閉じるボタン -->
          <button
            v-if="c.isClamped"
            @click="toggleExpand(i)"
            class="read-more-btn"
            type="button"
          >
            {{ c.isExpanded ? "閉じる" : "もっと見る" }}
          </button>

          <div class="comment-meta">
            <span class="comment-likes">👍 {{ c.likes }}</span>
          </div>

          <button
            v-if="!c.repliesExpanded && (c.replyContinuation || c.repliesLoaded)"
            class="replies-btn"
            type="button"
            :disabled="c.repliesLoading"
            @click="toggleReplies(c)"
          >
            {{ c.repliesLoading
              ? "返信を読み込み中…"
              : c.repliesLoaded
                ? `返信を表示${c.replyCount ? ` (${c.replyCount})` : ""}`
                : `返信を表示${c.replyCount ? ` (${c.replyCount})` : ""}` }}
          </button>
          <p v-if="c.repliesError" class="error-msg">{{ c.repliesError }}</p>

          <ul v-if="c.repliesExpanded && c.replies.length" class="reply-list">
            <li v-for="(reply, replyIndex) in c.replies" :key="reply.id || replyIndex" class="reply-item">
              <img
                v-if="reply.authorIcon"
                :src="reply.authorIcon"
                alt="アイコン"
                class="comment-author-icon"
                width="28"
                height="28"
                loading="lazy"
              />
              <div class="comment-content">
                <div class="comment-header">
                  <div class="comment-author">{{ reply.author }}</div>
                  <span class="comment-meta comment-date">{{ reply.date }}</span>
                </div>
                <div
                  class="comment-text"
                  :class="{ clamped: reply.isClamped && !reply.isExpanded, expanded: reply.isExpanded }"
                  :data-comment-index="i"
                  :data-reply-index="replyIndex"
                >
                  {{ reply.text }}
                </div>
                <button
                  v-if="reply.isClamped"
                  class="read-more-btn"
                  type="button"
                  @click="toggleReplyExpand(i, replyIndex)"
                >
                  {{ reply.isExpanded ? "閉じる" : "もっと見る" }}
                </button>
                <div class="comment-meta">👍 {{ reply.likes }}</div>
              </div>
            </li>
          </ul>
          <div v-if="c.repliesExpanded" class="reply-actions">
            <button
              v-if="c.repliesNextContinuation"
              class="replies-btn"
              type="button"
              :disabled="c.repliesLoading"
              @click="loadReplies(c)"
            >
              {{ c.repliesLoading ? "返信を読み込み中…" : "返信をさらに表示" }}
            </button>
            <button class="replies-btn" type="button" @click="toggleReplies(c)">
              返信を閉じる
            </button>
          </div>
        </div>
      </li>
    </ul>

    <div v-if="comments.length && nextContinuation" class="comments-more">
      <button type="button" class="retry-btn" :disabled="loadingMore" @click="fetchMoreComments">
        {{ loadingMore ? "さらに読み込み中…" : "コメントをさらに表示" }}
      </button>
      <button type="button" class="retry-btn" @click="scrollToPageTop">
        戻る
      </button>
    </div>

    <p v-if="!loading && !error && comments.length === 0" style="color: var(--text-primary);">コメントが見つかりません。ライブ配信の場合は取得できません</p>
    <p v-if="error" class="error-msg" style="color: var(--accent-weak);">⚠️ {{ error }}<br />
      <button @click="fetchComments" class="retry-btn" type="button">再取得</button>
    </p>
  </section>
</template>

<script>
import {
  comments as fetchCommentsApi,
  commentReplies as fetchCommentReplies,
} from "@/services/api/siatubeApi.js";
import { normalizeComment } from "@/services/api/siatubeAdapters.js";

export default {
  name: "Comment",
  props: {
    videoId: {
      type: String,
      required: true,
    },
    commentToken: {
      type: String,
      default: null,
    },
  },
  data() {
    return {
      comments: [],
      totalCommentCount: null,
      displayedCommentCount: 0,
      error: null,
      loading: false,
      loadingMore: false,
      sort: "top",
      nextContinuation: null,
      requestSequence: 0,
      scrollAnimationFrame: null,
    };
  },
  watch: {
    videoId: {
      immediate: true,
      handler() {
        this.resetComments();
      },
    },
    commentToken: {
      immediate: true,
      handler(token) {
        if (token) this.fetchComments();
      },
    },
  },
  mounted() {
    this.$nextTick(() => {
      this.checkCommentsHeight();
    });
  },
  updated() {
    this.$nextTick(() => {
      this.checkCommentsHeight();
    });
  },
  beforeUnmount() {
    if (this.scrollAnimationFrame !== null) {
      cancelAnimationFrame(this.scrollAnimationFrame);
    }
  },
  methods: {
    resetComments() {
      this.requestSequence += 1;
      this.comments = [];
      this.totalCommentCount = null;
      this.displayedCommentCount = 0;
      this.nextContinuation = null;
      this.error = null;
      this.loading = false;
      this.loadingMore = false;
    },

    async fetchComments(options = {}) {
      const append = options?.append === true;
      if (!append && !this.commentToken) return;
      const sequence = append ? this.requestSequence : ++this.requestSequence;
      this.error = null;
      if (append) {
        this.loadingMore = true;
      } else {
        this.loadingMore = false;
        this.comments = [];
        this.totalCommentCount = null;
        this.displayedCommentCount = 0;
        this.nextContinuation = null;
        this.loading = true;
      }

      try {
        const data = await fetchCommentsApi(this.videoId, {
          sort: this.sort,
          continuation: append ? this.nextContinuation : this.commentToken,
          retries: 1,
          timeout: 15000,
        });
        if (sequence !== this.requestSequence) return;

        const incoming = Array.isArray(data?.comments)
          ? data.comments.map((comment, index) => normalizeComment(comment, this.comments.length + index))
          : [];
        if (append) {
          const seen = new Set(this.comments.map((comment) => comment.id));
          this.comments.push(...incoming.filter((comment) => !seen.has(comment.id)));
        } else {
          this.comments = incoming;
        }
        if (!append) {
          this.totalCommentCount = data?.totalComments ?? this.comments.length;
        }
        const responseCommentCount = Number(data?.CommentsCount);
        const addedCount = Number.isFinite(responseCommentCount)
          ? responseCommentCount
          : incoming.length;
        this.displayedCommentCount = append
          ? this.displayedCommentCount + addedCount
          : addedCount;
        this.nextContinuation = data?.nextContinuation || null;
      } catch (e) {
        if (sequence !== this.requestSequence) return;
        console.warn("fetchComments error:", e);
        this.error = e?.connectionFailure
          ? e.message
          : append
            ? "コメントの追加取得に失敗しました"
            : "コメントの取得に失敗しました";
        if (!append) this.comments = [];
      } finally {
        if (sequence === this.requestSequence) {
          this.loading = false;
          this.loadingMore = false;
        }
      }
    },

    fetchMoreComments() {
      if (!this.nextContinuation || this.loadingMore) return;
      this.fetchComments({ append: true });
    },

    scrollToPageTop() {
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    async toggleReplies(comment) {
      if (!comment || comment.repliesLoading) return;
      if (comment.repliesLoaded) {
        const wasExpanded = comment.repliesExpanded;
        comment.repliesExpanded = !comment.repliesExpanded;
        if (wasExpanded) {
          this.$nextTick(() => {
            const commentIndex = this.comments.indexOf(comment);
            const commentItems = this.$el.querySelectorAll(".comment-item");
            this.scrollElementToCenter(commentItems[commentIndex]);
          });
        }
        return;
      }

      await this.loadReplies(comment);
      if (comment.repliesLoaded) comment.repliesExpanded = true;
    },

    scrollElementToCenter(element) {
      if (!element) return;
      if (this.scrollAnimationFrame !== null) {
        cancelAnimationFrame(this.scrollAnimationFrame);
      }

      const startY = window.scrollY;
      const rect = element.getBoundingClientRect();
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const targetY = Math.min(
        maxY,
        Math.max(0, startY + rect.top - (window.innerHeight - rect.height) / 2)
      );
      const distance = targetY - startY;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion || Math.abs(distance) < 1) {
        window.scrollTo(0, targetY);
        this.scrollAnimationFrame = null;
        return;
      }

      const duration = Math.min(800, Math.max(300, Math.abs(distance) / 0.92));
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

    async loadReplies(comment) {
      if (!comment || comment.repliesLoading) return;
      const continuation = comment.repliesLoaded
        ? comment.repliesNextContinuation
        : comment.replyContinuation;
      if (!continuation) return;

      comment.repliesLoading = true;
      comment.repliesError = "";
      try {
        const data = await fetchCommentReplies(this.videoId, continuation, {
          retries: 1,
          timeout: 15000,
        });
        const incoming = Array.isArray(data?.replies)
          ? data.replies.map((reply, index) => normalizeComment(reply, index))
          : [];
        const seen = new Set(comment.replies.map((reply) => reply.id));
        comment.replies.push(...incoming.filter((reply) => !seen.has(reply.id)));
        comment.repliesLoaded = true;
        comment.repliesNextContinuation = data?.nextContinuation || null;
      } catch (error) {
        console.warn("fetchCommentReplies error:", error);
        comment.repliesError = error?.connectionFailure
          ? error.message
          : "返信の取得に失敗しました";
      } finally {
        comment.repliesLoading = false;
      }
    },

    checkCommentsHeight() {
      const commentTextElements = this.$el.querySelectorAll(".comment-text[data-index]");

      commentTextElements.forEach((el) => {
        const index = Number(el.dataset.index);
        if (index === undefined || !this.comments[index]) return;

        const height = el.scrollHeight;

        this.comments[index].isClamped = height > 250;

        if (!this.comments[index].isExpanded && height <= 250) {
          this.comments[index].isClamped = false;
        }
      });

      const replyTextElements = this.$el.querySelectorAll(
        ".comment-text[data-comment-index][data-reply-index]"
      );
      replyTextElements.forEach((el) => {
        const commentIndex = Number(el.dataset.commentIndex);
        const replyIndex = Number(el.dataset.replyIndex);
        const reply = this.comments[commentIndex]?.replies?.[replyIndex];
        if (!reply) return;

        const isTooTall = el.scrollHeight > 250;
        reply.isClamped = isTooTall;
        if (!reply.isExpanded && !isTooTall) reply.isClamped = false;
      });
    },

    toggleExpand(index) {
      const comment = this.comments[index];
      comment.isExpanded = !comment.isExpanded;

      if (!comment.isExpanded) {
        this.$nextTick(() => {
          const commentItems = this.$el.querySelectorAll(".comment-item");
          const el = commentItems[index];
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    },

    toggleReplyExpand(commentIndex, replyIndex) {
      const reply = this.comments[commentIndex]?.replies?.[replyIndex];
      if (!reply) return;
      reply.isExpanded = !reply.isExpanded;

      if (!reply.isExpanded) {
        this.$nextTick(() => {
          const comment = this.comments[commentIndex];
          const replyPosition = comment?.replies?.indexOf(reply);
          const replyItems = this.$el.querySelectorAll(
            `.comment-item:nth-child(${commentIndex + 1}) .reply-item`
          );
          replyItems[replyPosition]?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
  },
};
</script>

<style scoped>
.comment-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.comments-section {
  margin-block-end: 20px;
  padding: 16px;
  border-radius: 8px;
  margin-top: -10px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.3s ease, color 0.3s ease;
  overflow-anchor: none;
}

.comments-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.comments-heading select {
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 8px;
}

.comment-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.comment-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.comment-author-icon {
  border-radius: 50%;
  margin-right: 12px;
  flex-shrink: 0;
}

.comment-content {
  flex: 1;
}

.reply-list {
  list-style: none;
  padding: 8px 0 0 12px;
  margin: 0;
}

.reply-item {
  display: flex;
  align-items: flex-start;
  padding: 8px 0;
}

.replies-btn {
  margin-top: 6px;
  border: 0;
  background: transparent;
  color: var(--accent-color);
  cursor: pointer;
  font-weight: 600;
}

.reply-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.comments-more {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
}

.comment-author {
  font-weight: bold;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.comment-text {
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
  color: var(--text-primary);
}

.comment-text.clamped {
  max-height: 250px;
  overflow: hidden;
}

/* 展開状態：高さ制限解除 */
.comment-text.expanded {
  max-height: none;
  overflow: visible;
}

.read-more-btn {
  background: none;
  border: none;
  color: var(--accent-color);
  cursor: pointer;
  font-size: 0.9em;
  margin-top: 4px;
  padding: 0;
  user-select: none;
  transition: color 0.2s ease;
}

.read-more-btn:hover {
  text-decoration: underline;
  color: var(--accent-dark);
}

.comment-meta {
  font-size: 0.85em;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 4px;
}

.comment-likes{
  margin-top: 6px;
}

.comment-date,
.comment-likes {
  user-select: none;
}

.error-msg {
  color: var(--accent-weak);
  margin-top: 12px;
}
</style>
