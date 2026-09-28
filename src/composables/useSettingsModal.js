import { onBeforeUnmount, provide, ref, watch } from "vue";

const STORAGE_KEY = "settingsModalOpen";

export function useSettingsModal() {
  // A new page always starts with the settings dialog closed.
  const isOpen = ref(false);

  function openSettingsModal() {
    isOpen.value = true;
  }

  function closeSettingsModal() {
    isOpen.value = false;
  }

  watch(isOpen, (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch (error) {
      console.warn("Failed to save the settings dialog state", error);
    }
    try {
      document.body.classList.toggle("settings-modal-open", value);
    } catch {}
  });

  function handleStorage(event) {
    if (event?.key === STORAGE_KEY) {
      isOpen.value = event.newValue === "true";
    }
  }

  window.addEventListener("storage", handleStorage);
  onBeforeUnmount(() => {
    window.removeEventListener("storage", handleStorage);
    try {
      document.body.classList.remove("settings-modal-open");
    } catch {}
  });

  const settingsModal = { isOpen, openSettingsModal, closeSettingsModal };
  provide("settingsModal", settingsModal);
  return settingsModal;
}
