import { ensureGuardChallenge } from "./challenge.js";
import {
  acceptReturnedSession,
  loadGuardSession,
  withGuardSession,
} from "./guard-session.js";

const SIATUBE_ORIGIN = "https://siatube.com";

export function isGuardedApiUrl(inputUrl) {
  try {
    const url = new URL(inputUrl);
    return url.origin === SIATUBE_ORIGIN && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function isChallengeRequired(response) {
  return response?.status === 403 && response?.payload?.code === "CHALLENGE_REQUIRED";
}

function urlWithCurrentSession(url) {
  return withGuardSession(url, loadGuardSession()?.sessionId);
}

export async function guardedGet(url, { send, signal }) {
  if (!isGuardedApiUrl(url)) return send(url, { signal });

  let response = await send(urlWithCurrentSession(url), { signal });
  acceptReturnedSession(response?.payload);
  if (!isChallengeRequired(response)) return response;

  await ensureGuardChallenge({ send, signal });
  response = await send(urlWithCurrentSession(url), { signal });
  acceptReturnedSession(response?.payload);
  return response;
}
