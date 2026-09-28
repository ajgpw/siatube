import { onBeforeUnmount, ref } from "vue";
import { API_CONNECTION_FAILURE_EVENT } from "@/services/api/siatubeApi.js";
import { GUARD_PROGRESS_EVENT } from "@/services/guard/challenge.js";
import {
  checkForUpdate,
  fetchLatestBuildHtml,
  replaceDocumentWithHtml,
} from "@/utils/versionCheck.js";

export function useAppNotifications(openSettingsModal) {
  let disposed = false;
  const connectionFailurePrompt = ref(false);
  const guardProgressMessage = ref("");
  const updateAvailable = ref(false);
  const currentVersion = ref("");
  const latestVersion = ref("");
  const temporaryUpdateLoading = ref(false);
  const temporaryUpdateError = ref(false);

  function handleApiConnectionFailure() {
    connectionFailurePrompt.value = true;
  }

  function handleGuardProgress(event) {
    if (event?.detail?.state === "working") {
      guardProgressMessage.value = "接続を確認しています…";
    } else if (event?.detail?.state === "rate-limited") {
      guardProgressMessage.value = `アクセスが集中しています。${event.detail.retryAfter}秒後に再試行します…`;
    } else {
      guardProgressMessage.value = "";
    }
  }

  function openProxySettings() {
    connectionFailurePrompt.value = false;
    openSettingsModal();
  }

  async function useLatestVersionTemporarily() {
    if (disposed || temporaryUpdateLoading.value) return;
    temporaryUpdateLoading.value = true;
    temporaryUpdateError.value = false;
    try {
      const html = await fetchLatestBuildHtml();
      if (disposed) return;
      replaceDocumentWithHtml(html);
    } catch (error) {
      if (disposed) return;
      console.error("Failed to load the latest temporary build", error);
      temporaryUpdateError.value = true;
      temporaryUpdateLoading.value = false;
    }
  }

  window.addEventListener(API_CONNECTION_FAILURE_EVENT, handleApiConnectionFailure);
  window.addEventListener(GUARD_PROGRESS_EVENT, handleGuardProgress);
  onBeforeUnmount(() => {
    disposed = true;
    window.removeEventListener(API_CONNECTION_FAILURE_EVENT, handleApiConnectionFailure);
    window.removeEventListener(GUARD_PROGRESS_EVENT, handleGuardProgress);
  });

  checkForUpdate().then(async (result) => {
    if (disposed) return;
    currentVersion.value = result.currentVersion;
    latestVersion.value = result.latestVersion;
    updateAvailable.value = result.updateAvailable;
    if (result.updateAvailable) {
      await useLatestVersionTemporarily();
    }
  }).catch(() => {});

  return {
    connectionFailurePrompt,
    guardProgressMessage,
    openProxySettings,
    updateAvailable,
    currentVersion,
    latestVersion,
    temporaryUpdateLoading,
    temporaryUpdateError,
    useLatestVersionTemporarily,
  };
}
