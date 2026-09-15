import currentVersionSource from "../../version.txt?raw";
import { loadRequestProxy, proxiedRequestUrl } from "./requestProxy.js";

export const VERSION_SOURCE_URL =
  "https://raw.githubusercontent.com/ajgpw/siatube/refs/heads/main/client/version.txt";
export const LATEST_BUILD_URL =
  "https://raw.githubusercontent.com/ajgpw/siatube/refs/heads/main/siatube-full.html.txt";

export function normalizeVersion(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^v/i, "")
    .trim();
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left).split(/[.-]/);
  const b = normalizeVersion(right).split(/[.-]/);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = a[index] ?? "0";
    const bPart = b[index] ?? "0";
    const aNumber = /^\d+$/.test(aPart) ? Number(aPart) : null;
    const bNumber = /^\d+$/.test(bPart) ? Number(bPart) : null;
    const comparison =
      aNumber !== null && bNumber !== null
        ? aNumber - bNumber
        : aPart.localeCompare(bPart, undefined, { numeric: true });
    if (comparison !== 0) return comparison < 0 ? -1 : 1;
  }
  return 0;
}

async function fetchVersion(url) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "text/plain" },
  });
  if (!response.ok) throw new Error(`Version request failed: ${response.status}`);
  const version = normalizeVersion(await response.text());
  if (!version || !/^\d+(?:\.\d+)*(?:[-.][0-9A-Za-z]+)*$/.test(version)) {
    throw new Error("Invalid version response");
  }
  return version;
}

export async function fetchLatestBuildHtml() {
  const proxyUrl = loadRequestProxy().url;
  const requestUrl = proxyUrl
    ? proxiedRequestUrl(LATEST_BUILD_URL, proxyUrl)
    : LATEST_BUILD_URL;
  const response = await fetch(requestUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: { Accept: "text/html,text/plain" },
  });
  if (!response.ok) {
    throw new Error(`Latest build request failed: ${response.status}`);
  }

  const html = await response.text();
  if (!/<(?:!doctype\s+html|html)(?:\s|>)/i.test(html)) {
    throw new Error("Invalid latest build response");
  }
  return html;
}

export function replaceDocumentWithHtml(html) {
  document.open();
  document.write(html);
  document.close();
}

export async function checkForUpdate() {
  const currentVersion = normalizeVersion(currentVersionSource);
  const candidates = [VERSION_SOURCE_URL];
  const proxyUrl = loadRequestProxy().url;
  if (proxyUrl) candidates.push(proxiedRequestUrl(VERSION_SOURCE_URL, proxyUrl));
  candidates.push("/api/version-check");

  let latestVersion = "";
  for (const url of [...new Set(candidates)]) {
    try {
      latestVersion = await fetchVersion(url);
      break;
    } catch {
      // Try the proxy.
    }
  }

  return {
    currentVersion,
    latestVersion,
    updateAvailable:
      Boolean(latestVersion) && compareVersions(currentVersion, latestVersion) < 0,
  };
}
