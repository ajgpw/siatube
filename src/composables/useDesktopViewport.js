import { onScopeDispose, ref } from "vue";

export const DESKTOP_VIEWPORT_QUERY = "(min-width: 1000px)";

export function useDesktopViewport() {
  const browser = window;
  const query = browser.matchMedia?.(DESKTOP_VIEWPORT_QUERY) || null;
  const isDesktopViewport = ref(query ? query.matches : browser.innerWidth >= 1000);

  function syncViewport() {
    isDesktopViewport.value = query ? query.matches : browser.innerWidth >= 1000;
  }

  if (query?.addEventListener) {
    query.addEventListener("change", syncViewport);
    onScopeDispose(() => query.removeEventListener("change", syncViewport));
  } else if (query?.addListener) {
    query.addListener(syncViewport);
    onScopeDispose(() => query.removeListener(syncViewport));
  } else {
    browser.addEventListener("resize", syncViewport);
    onScopeDispose(() => browser.removeEventListener("resize", syncViewport));
  }

  return { isDesktopViewport };
}
