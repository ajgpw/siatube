<template>
  <div class="autoplay-notification">
    <span class="notification-text">{{ message }}</span>
    <button class="notification-close" @click="$emit('close')">×</button>
  </div>
</template>

<script>
export default {
  name: "AutoplayNotification",
  props: { message: { type: String, default: "" } },
};
</script>

<style scoped>
.autoplay-notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  padding: 16px 20px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 1000;
  animation: slideIn 0.3s ease-out;
  max-width: 400px;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(100px); }
  to { opacity: 1; transform: translateX(0); }
}

.notification-text {
  font-size: 0.95rem;
  line-height: 1.4;
  color: var(--text-primary);
}

.notification-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}
.notification-close:hover { color: var(--text-primary); }

@media (max-width: 789px) {
  .autoplay-notification {
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
    left: 12px;
    right: 12px;
    max-width: none;
    padding: 12px;
  }
  .notification-close { min-width: 44px; min-height: 44px; }
}
</style>
