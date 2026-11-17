import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_LS_PREFIX, loadPersistedDrafts, syncDraftToStorage, type DraftStore } from "./draftStorage.ts";

/** In-memory DraftStore for tests. */
function makeStore(initial: Record<string, string> = {}): DraftStore {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(i: number) { return [...data.keys()][i] ?? null; },
    getItem(k: string) { return data.get(k) ?? null; },
    setItem(k: string, v: string) { data.set(k, v); },
    removeItem(k: string) { data.delete(k); },
  };
}

test("loadPersistedDrafts returns empty map when store is null", () => {
  assert.equal(loadPersistedDrafts(null).size, 0);
});

test("loadPersistedDrafts ignores entries without the prefix", () => {
  const store = makeStore({ "other:key": "value", "unrelated": "data" });
  assert.equal(loadPersistedDrafts(store).size, 0);
});

test("loadPersistedDrafts loads entries with the prefix, keyed without it", () => {
  const store = makeStore({
    [`${DRAFT_LS_PREFIX}/worktree\x00src/file.ts`]: "draft text",
    [`${DRAFT_LS_PREFIX}/worktree\x00src/other.ts`]: "other draft",
    "unrelated": "ignored",
  });
  const result = loadPersistedDrafts(store);
  assert.equal(result.size, 2);
  assert.equal(result.get("/worktree\x00src/file.ts"), "draft text");
  assert.equal(result.get("/worktree\x00src/other.ts"), "other draft");
});

test("syncDraftToStorage writes a draft", () => {
  const store = makeStore();
  syncDraftToStorage("/wt\x00a.ts", "my draft", store);
  assert.equal(store.getItem(DRAFT_LS_PREFIX + "/wt\x00a.ts"), "my draft");
});

test("syncDraftToStorage removes the entry when draft is undefined", () => {
  const store = makeStore({ [`${DRAFT_LS_PREFIX}/wt\x00a.ts`]: "old draft" });
  syncDraftToStorage("/wt\x00a.ts", undefined, store);
  assert.equal(store.getItem(DRAFT_LS_PREFIX + "/wt\x00a.ts"), null);
});

test("syncDraftToStorage is a no-op when store is null", () => {
  // Must not throw.
  syncDraftToStorage("/wt\x00a.ts", "text", null);
});

test("loadPersistedDrafts persists empty-string drafts (intentional empty edit)", () => {
  const store = makeStore({ [`${DRAFT_LS_PREFIX}/wt\x00a.ts`]: "" });
  const result = loadPersistedDrafts(store);
  assert.equal(result.size, 1);
  assert.equal(result.get("/wt\x00a.ts"), "");
});

test("syncDraftToStorage persists empty-string draft (not treated as absent)", () => {
  const store = makeStore();
  syncDraftToStorage("/wt\x00a.ts", "", store);
  assert.equal(store.getItem(DRAFT_LS_PREFIX + "/wt\x00a.ts"), "");
});

test("round-trip: write then load returns the same drafts", () => {
  const store = makeStore();
  syncDraftToStorage("/wt\x00a.ts", "alpha", store);
  syncDraftToStorage("/wt\x00b.ts", "beta", store);
  const result = loadPersistedDrafts(store);
  assert.equal(result.get("/wt\x00a.ts"), "alpha");
  assert.equal(result.get("/wt\x00b.ts"), "beta");
});

test("round-trip: clear then load omits the removed draft", () => {
  const store = makeStore({ [`${DRAFT_LS_PREFIX}/wt\x00a.ts`]: "old" });
  syncDraftToStorage("/wt\x00a.ts", undefined, store);
  const result = loadPersistedDrafts(store);
  assert.equal(result.has("/wt\x00a.ts"), false);
});
