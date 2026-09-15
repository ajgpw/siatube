import { claimType2StreamRequestSlot } from "./type2StreamRequestCooldown.js";

function waitForSlot(ms, signal) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

// Owns request lifetime only. Shared API requests/cache remain owned by siatubeApi.
// Cancelling this consumer must not abort another player's shared request.
export function createType2StreamRequest({
  fetchStream,
  onState = () => {},
  onStart = () => {},
  onResponse = () => {},
  onError = () => {},
  claimSlot = claimType2StreamRequestSlot,
  wait = waitForSlot,
}) {
  let active = null;
  let disposed = false;

  function cancel() {
    const previous = active;
    active = null;
    previous?.controller.abort();
    onState({ phase: "idle", waitUntil: 0 });
  }

  function load(id, forceRefresh = false) {
    if (disposed) return Promise.resolve();
    // Repeated clicks keep the current request and its response alive.
    if (active?.id === id) return active.promise;
    cancel();
    if (!id) return Promise.resolve();
    const controller = new AbortController();
    const context = {
      id,
      controller,
      isCurrent: () => !disposed && active === context,
    };
    active = context;
    context.promise = run();
    return context.promise;

    async function run() {
      try {
        onStart();
        while (context.isCurrent()) {
          const remaining = claimSlot(id);
          if (remaining === 0) break;
          onState({ phase: "cooldown", waitUntil: Date.now() + remaining });
          await wait(remaining, controller.signal);
        }
        if (!context.isCurrent()) return;
        onState({ phase: "requesting", waitUntil: 0 });
        const data = await fetchStream(id, {
          forceRefresh,
          origin: "siatube",
          retries: 1,
          timeout: 30_000,
          signal: controller.signal,
        });
        if (!context.isCurrent()) return;
        onState({ phase: "preparing", waitUntil: 0 });
        await onResponse(data, context);
        if (context.isCurrent()) onState({ phase: "ready", waitUntil: 0 });
      } catch (error) {
        if (!context.isCurrent()) return;
        onError(error);
        onState({ phase: "error", waitUntil: 0 });
      } finally {
        if (active === context) active = null;
      }
    }
  }

  return {
    load,
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
