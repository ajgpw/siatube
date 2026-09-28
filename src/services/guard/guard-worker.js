import { proofMatches } from "./hash.js";

const cancelled = new Set();

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cancel") {
    cancelled.add(data.requestId);
    return;
  }
  const { requestId, nonce, difficultyBits, version, expiresAt } = data;
  try {
    for (let counter = 0; counter <= Number.MAX_SAFE_INTEGER; counter += 1) {
      if ((counter & 4095) === 0) {
        if (cancelled.delete(requestId)) return;
        if (Date.now() >= expiresAt - 2_000) {
          self.postMessage({ requestId, code: "LOCAL_CHALLENGE_EXPIRED" });
          return;
        }
      }
      if (proofMatches(nonce, counter, difficultyBits, version)) {
        self.postMessage({ requestId, counter });
        return;
      }
    }
    self.postMessage({ requestId, code: "COUNTER_EXHAUSTED" });
  } catch {
    self.postMessage({ requestId, code: "POW_FAILED" });
  }
});
