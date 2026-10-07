import { onBeforeUnmount, onMounted, ref } from "vue";
import {
  AMBIENT_LIGHT_SETTING_EVENT,
  AMBIENT_LIGHT_STORAGE_KEY,
  loadAmbientLight,
  saveAmbientLight,
} from "@/services/storage/settingsManager.js";

export function useAmbientLight() {
  const enabled = ref(loadAmbientLight());

  function onSettingChange(event) {
    enabled.value = typeof event.detail?.enabled === "boolean"
      ? event.detail.enabled
      : loadAmbientLight();
  }

  function onStorage(event) {
    if (event.key === AMBIENT_LIGHT_STORAGE_KEY || event.key === null) {
      enabled.value = loadAmbientLight();
    }
  }

  function setEnabled(value) {
    enabled.value = !!value;
    saveAmbientLight(enabled.value);
  }

  onMounted(() => {
    enabled.value = loadAmbientLight();
    window.addEventListener(AMBIENT_LIGHT_SETTING_EVENT, onSettingChange);
    window.addEventListener("storage", onStorage);
  });
  onBeforeUnmount(() => {
    window.removeEventListener(AMBIENT_LIGHT_SETTING_EVENT, onSettingChange);
    window.removeEventListener("storage", onStorage);
  });

  return { enabled, setEnabled };
}
