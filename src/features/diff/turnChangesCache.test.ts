// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipLayout,
  createTurnChangesStore,
  readCachedTurnChanges,
  TURN_CHANGES_ENTRY_LIMIT,
  turnCacheKey,
  writeCachedTurnChanges,
  type TurnRef,
} from "./turnChangesCache.ts";
import type { FileChange } from "./types.ts";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
}

const ref: TurnRef = { sessionId: "ws-1", turnId: "t-1" };
const change = (path: string, additions = 1, deletions = 0): FileChange => ({ path, old_path: null, status: "modified", binary: false, additions, deletions });
const quiet = () => undefined;

test("entries are keyed by the JSON pair [sessionId, turnId]", () => {
  assert.equal(turnCacheKey(ref), 'openconductor.turn-changes-cache:["ws-1","t-1"]');
  assert.notEqual(turnCacheKey({ sessionId: "a-b", turnId: "c" }), turnCacheKey({ sessionId: "a", turnId: "b-c" }));
});

test("write then read round-trips; other turns miss", () => {
  const s = new MemoryStorage();
  assert.equal(writeCachedTurnChanges(s, ref, [change("a.ts")], quiet), true);
  assert.deepEqual(readCachedTurnChanges(s, ref, quiet), [change("a.ts")]);
  assert.equal(readCachedTurnChanges(s, { ...ref, turnId: "t-2" }, quiet), undefined);
});

test("malformed or foreign entries read as missing", () => {
  const s = new MemoryStorage();
  s.setItem(turnCacheKey(ref), "{not json");
  const logged: string[] = [];
  assert.equal(readCachedTurnChanges(s, ref, (m) => logged.push(m)), undefined);
  assert.deepEqual(logged, ["Failed to read turn changes from local storage"]);
  s.setItem(turnCacheKey(ref), JSON.stringify([{ path: "a", status: "weird" }]));
  assert.equal(readCachedTurnChanges(s, ref, quiet), undefined);
});

test("entries over 5 MB and storage errors are not written", () => {
  const s = new MemoryStorage();
  const huge = [{ ...change("x"), path: "p".repeat(TURN_CHANGES_ENTRY_LIMIT) }];
  assert.equal(writeCachedTurnChanges(s, ref, huge, quiet), false);
  assert.equal(s.items.size, 0);
  const full = { setItem: () => { throw new Error("quota"); } };
  const logged: string[] = [];
  assert.equal(writeCachedTurnChanges(full, ref, [change("a")], (m) => logged.push(m)), false);
  assert.deepEqual(logged, ["Failed to write turn changes to local storage"]);
});

test("load fetches once, shares concurrent requests, then serves the cache", async () => {
  const s = new MemoryStorage();
  let calls = 0;
  const store = createTurnChangesStore(s, async (r, worktree) => {
    calls++;
    assert.deepEqual([r, worktree], [ref, "/w"]);
    return [change("a.ts")];
  }, quiet);
  const [a, b] = await Promise.all([store.load(ref, "/w"), store.load(ref, "/w")]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await store.load(ref, "/w");
  assert.equal(calls, 1);
  // A fresh store (an app restart) reads storage instead of fetching.
  const again = createTurnChangesStore(s, async () => assert.fail("must not fetch"), quiet);
  assert.deepEqual(again.peek(ref), [change("a.ts")]);
});

test("a failed load is not cached, so the next one retries", async () => {
  const s = new MemoryStorage();
  let calls = 0;
  const store = createTurnChangesStore(s, async () => {
    calls++;
    if (calls === 1) throw new Error("checkpoints for turn t-1 are not ready");
    return [change("b.ts")];
  }, quiet);
  await assert.rejects(store.load(ref, "/w"), /not ready/);
  assert.deepEqual(await store.load(ref, "/w"), [change("b.ts")]);
  assert.equal(calls, 2);
});

test("record stores the list the turn ended with and notifies subscribers", () => {
  const s = new MemoryStorage();
  const store = createTurnChangesStore(s, async () => assert.fail("must not fetch"), quiet);
  let notified = 0;
  const off = store.subscribe(() => notified++);
  store.record(ref, [change("c.ts")]);
  assert.equal(notified, 1);
  assert.deepEqual(store.peek(ref), [change("c.ts")]);
  assert.deepEqual(readCachedTurnChanges(s, ref, quiet), [change("c.ts")]);
  off();
  store.record(ref, []);
  assert.equal(notified, 1);
});

test("chips: up to 3 files all show; more show 2 and reveal 3 per click", () => {
  const files = (n: number) => Array.from({ length: n }, (_, i) => change(`f${i}`, i + 1, 1));
  assert.deepEqual(chipLayout(files(3), 0).more, null);
  assert.equal(chipLayout(files(3), 0).first.length, 3);
  assert.equal(chipLayout(files(3), 0).revealed.length, 0);

  const eight = chipLayout(files(8), 0);
  assert.deepEqual(eight.first.map((f) => f.path), ["f0", "f1"]);
  assert.equal(eight.revealed.length, 0);
  assert.equal(eight.hidden.length, 6);
  assert.equal(eight.more, "Show 3 more changed files");
  assert.deepEqual(eight.hiddenTotals, { additions: 3 + 4 + 5 + 6 + 7 + 8, deletions: 6 });
  // A click keeps the first row and puts the next 3 on their own line.
  const once = chipLayout(files(8), 1);
  assert.deepEqual(once.first.map((f) => f.path), ["f0", "f1"]);
  assert.deepEqual(once.revealed.map((f) => f.path), ["f2", "f3", "f4"]);
  assert.equal(once.hidden.length, 3);
  assert.equal(chipLayout(files(8), 1).more, "Show 3 more changed files");
  assert.equal(chipLayout(files(6), 1).more, "Show 1 more changed file");
  assert.equal(chipLayout(files(8), 2).more, null);
  assert.equal(chipLayout([], 0).more, null);
});
