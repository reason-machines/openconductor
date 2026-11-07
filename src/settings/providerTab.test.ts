import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readProviderTab, selectProviderTab, subscribeProviderTab } from "./providerTab.ts";

const original = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "window", original);
  else Reflect.deleteProperty(globalThis, "window");
});

function fixture(search: string) {
  let url = new URL(`https://fixture.invalid/settings/user/providers${search}#section`);
  const target = new EventTarget();
  const state = { fixture: true };
  const window = Object.assign(target, {
    get location() { return url; },
    history: {
      state,
      replaceState(nextState: unknown, _title: string, next: string) {
        assert.equal(nextState, state, "navigation preserves history state");
        url = new URL(next, url);
      },
    },
  });
  // Object.assign snapshots getters, so location follows this fixture's current URL.
  Object.defineProperty(window, "location", { get: () => url });
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  return window;
}

test("provider selections notify an already-subscribed tab and preserve other URL state", () => {
  const window = fixture("?demo=1&providerTab=codex");
  const selected: string[] = [];
  const unsubscribe = subscribeProviderTab(() => selected.push(readProviderTab()));
  assert.equal(readProviderTab(), "codex");
  selectProviderTab("claude");
  selectProviderTab("reason");
  assert.deepEqual(selected, ["claude", "reason"]);
  assert.equal(window.location.search, "?demo=1&providerTab=reason");
  assert.equal(window.location.hash, "#section");
  unsubscribe();
  selectProviderTab("codex");
  assert.deepEqual(selected, ["claude", "reason"], "unmounted subscribers are removed");
});

test("browser history also notifies provider tab subscribers", () => {
  const window = fixture("?providerTab=claude");
  const selected: string[] = [];
  const unsubscribe = subscribeProviderTab(() => selected.push(readProviderTab()));
  window.history.replaceState(window.history.state, "", "/settings/user/providers?providerTab=codex");
  window.dispatchEvent(new Event("popstate"));
  assert.deepEqual(selected, ["codex"]);
  unsubscribe();
  window.dispatchEvent(new Event("popstate"));
  assert.deepEqual(selected, ["codex"]);
});

test("obsolete or missing provider names use Reason", () => {
  for (const query of ["", "?providerTab=opencode", "?providerTab=unknown"]) {
    fixture(query);
    assert.equal(readProviderTab(), "reason");
  }
});
