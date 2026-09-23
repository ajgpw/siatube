import GuardWorker from "./guard-worker.js?worker&inline";

// Inline the worker so downloaded HTML and GAS deployments need no asset URL.
export function createGuardWorker() {
  return new GuardWorker();
}
