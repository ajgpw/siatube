const DEFAULT_SIATUBE_API_ORIGIN = "https://siatube.com";

// API requests always go directly to SiaTube instead of the hosting origin.
export const SIATUBE_API_ORIGIN = DEFAULT_SIATUBE_API_ORIGIN;
export { DEFAULT_SIATUBE_API_ORIGIN };

// Legacy exports are intentionally kept while callers migrate from the old
// randomly selected Apps Script endpoints. They now always resolve to SiaTube.
export const API_URLS = Object.freeze([SIATUBE_API_ORIGIN]);

export function apiurl() {
  return SIATUBE_API_ORIGIN;
}

export const STORAGE_KEY = "custom_api_endpoints_v1";
export const MODE_KEY = "api_mode_v1";
