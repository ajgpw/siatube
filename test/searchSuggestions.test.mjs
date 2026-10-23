import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const component = readFileSync(new URL("../src/components/layout/HeaderSearch.vue", import.meta.url), "utf8");
const script = component.split("<script setup>")[1].split("</script>")[0];

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const requests = [];
  let unmount;
  const context = vm.createContext({
    ref: (value) => ({ value }),
    defineEmits: () => () => {},
    defineProps: () => ({}),
    onMounted() {},
    onBeforeUnmount(callback) { unmount = callback; },
    watch() {},
    setTimeout,
    clearTimeout,
    AbortController,
    document: { removeEventListener() {} },
    fetchSearchSuggestions(keyword, signal) {
      return new Promise((resolve) => requests.push({ keyword, signal, resolve }));
    },
  });
  vm.runInContext(script.slice(script.indexOf("const emit =")) + `
    globalThis.search = { query, suggestions, onInput, clearQuery, submitSearch, onClickOutside, searchFormRef };
  `, context);
  return { ...context.search, requests, unmount };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("suggestions wait for two seconds of inactivity and use the latest input", async (t) => {
  const search = setup(t);
  search.query.value = "first";
  search.onInput();
  t.mock.timers.tick(1999);
  assert.equal(search.requests.length, 0);
  search.query.value = " latest ";
  search.onInput();
  t.mock.timers.tick(1999);
  assert.equal(search.requests.length, 0);
  t.mock.timers.tick(1);
  assert.equal(search.requests.length, 1);
  assert.equal(search.requests[0].keyword, "latest");
  search.requests[0].resolve(["latest result"]);
  await flush();
  assert.deepEqual(Array.from(search.suggestions.value), ["latest result"]);
});

test("new input aborts old requests and ignores stale responses", async (t) => {
  const search = setup(t);
  search.query.value = "old";
  search.onInput();
  t.mock.timers.tick(2000);
  search.query.value = "new";
  search.onInput();
  assert.equal(search.requests[0].signal.aborted, true);
  t.mock.timers.tick(2000);
  search.requests[1].resolve(["new result"]);
  await flush();
  search.requests[0].resolve(["old result"]);
  await flush();
  assert.deepEqual(Array.from(search.suggestions.value), ["new result"]);
});

for (const action of ["clearQuery", "submitSearch", "unmount", "outside", "empty"]) {
  test(`${action} cancels pending suggestions`, (t) => {
    const search = setup(t);
    search.query.value = "query";
    search.onInput();
    if (action === "outside") {
      search.searchFormRef.value = { contains: () => false };
      search.onClickOutside({ target: {} });
    } else if (action === "empty") {
      search.query.value = "  ";
      search.onInput();
    } else search[action]();
    t.mock.timers.tick(2000);
    assert.equal(search.requests.length, 0);
  });
}
