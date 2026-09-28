<template>
  <router-link :to="`/channel/${video.id}`" class="thumbnail-link">
    <div class="channel-thumbnail-wrapper">
      <img
        :src="video.channelIcon || video.icon"
        :alt="getChannelName() + 'のアイコン'"
        class="channel-icon-large"
        @error="onChannelIconError"
      />
    </div>
  </router-link>

  <div class="info">
    <h2 class="channel-name">
      <router-link :to="`/channel/${video.id}`" class="title-link">
        {{ getChannelName() }}
      </router-link>
    </h2>

    <p class="subscriber-count">
      登録者数: {{ video.subscriberCount }}
    </p>
  </div>
</template>

<script>
export default {
  props: {
    video: {
      type: Object,
      required: true,
    },
  },
  methods: {
    getChannelName() {
      return this.video.channel || this.video.name;
    },
    onChannelIconError(event) {
      event.target.style.display = "none";
    },
  },
};
</script>

<style scoped>
.title-link,
.thumbnail-link {
  text-decoration: none;
}

.channel-thumbnail-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1.2rem 0 0.5rem 0;
  background-color: transparent;
  padding-top: 40px;
}

.channel-icon-large {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.info {
  padding: 1rem;
}

.channel-name {
  font-size: 1rem;
  margin: 0 0 0.5rem;
  color: var(--text-primary);
}

.channel-name a {
  color: var(--text-primary);
  text-decoration: none;
  transition: color 0.2s ease;
}

.channel-name a:hover {
  color: var(--link-hover);
  text-decoration: underline;
}

.subscriber-count {
  font-weight: bold;
  color: var(--text-primary);
  margin-top: 0.4rem;
  font-size: 0.9rem;
}
</style>
