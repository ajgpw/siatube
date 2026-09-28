<template>
  <div
    class="custom-dropdown"
    @click="onToggle"
    :aria-expanded="isOpen ? 'true' : 'false'"
  >
    <span class="custom-dropdown-label">
      {{ labelText }}
      <span class="dropdown-ending">▼</span>
    </span>

    <div v-if="isOpen" class="custom-dropdown-menu">
      <div class="custom-dropdown-item" @click.stop="select('1')">通常</div>
      <div class="custom-dropdown-item" @click.stop="select('2')" style="color: red;">再生できない場合こちら</div>
    </div>
  </div>
</template>

<script>
export default {
  name: "StreamTypeDropdown",
  props: {
    resolvedStreamType: { type: String, default: "" },
    isOpen: { type: Boolean, default: false },
  },
  emits: ["toggle", "select"],
  computed: {
    labelText() {
      if (!this.resolvedStreamType) return "再生出来ない場合";
      if (this.resolvedStreamType === "1") return "ブロックされた場合はこちら";
      if (this.resolvedStreamType === "2") return "再生モード：タイプ２";
      return "再生出来ない場合";
    },
  },
  methods: {
    onToggle() {
      this.$emit("toggle");
    },
    select(val) {
      this.$emit("select", val);
    },
  },
};
</script>

<style scoped>
.dropdown-ending {
  display: inline-block;
  font-size: 1rem;
  margin-block-start: 0px;
  margin-block-end: 0px;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
  display: inline-block;
  margin-top: -1rem;
  margin-bottom: -0.5rem;
  margin-left: 1rem;
}

.custom-dropdown {
  position: relative;
  background: var(--bg-secondary);
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  width: max-content;
  font-size: 0.9rem;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.custom-dropdown-label { white-space: nowrap; }

.custom-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.25rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  min-width: 100%;
  white-space: nowrap;
  max-width: max-content;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.custom-dropdown-item {
  padding: 0.5rem 1rem;
  cursor: pointer;
  color: var(--text-primary);
}

.custom-dropdown-item:hover { background-color: var(--hover-bg); }
</style>
