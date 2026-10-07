import { onBeforeUnmount, ref, watch } from "vue";

const EXPANDED_SIDEBAR_WIDTH = 1315;

export function useSidebar(route) {
  const sidebarOpen = ref(window.innerWidth >= EXPANDED_SIDEBAR_WIDTH);
  let previousSidebarOpen = null;

  function handleToggleSidebar(isOpen) {
    sidebarOpen.value = isOpen;
  }

  function updateSidebarByWidth() {
    sidebarOpen.value = route.path !== "/watch" && window.innerWidth >= EXPANDED_SIDEBAR_WIDTH;
  }

  window.addEventListener("resize", updateSidebarByWidth);
  onBeforeUnmount(() => {
    window.removeEventListener("resize", updateSidebarByWidth);
  });

  // Restore the user's sidebar state when leaving the watch page.
  watch(() => route.path, (path) => {
    if (path === "/watch") {
      if (previousSidebarOpen === null) {
        previousSidebarOpen = sidebarOpen.value;
      }
      sidebarOpen.value = false;
    } else if (previousSidebarOpen !== null) {
      sidebarOpen.value = previousSidebarOpen;
      previousSidebarOpen = null;
    }
  }, { immediate: true });

  return { sidebarOpen, handleToggleSidebar };
}
