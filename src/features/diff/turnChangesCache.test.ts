// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chipLayout,
  createTurnChangesStore,
  dropLegacyTurnCache,
  readCachedTurnChanges,
  turnCacheId,
  TURN_CHANGES_SIZE_LIMIT,
  TURN_CHANGES_SUBSYSTEM,
  writeCachedTurnChanges,
  type TurnChangesStorage,
  type TurnRef,
} from "./turnChangesCache.ts";
import type { FileChange } from "./types.ts";

/** The backend's subsystemStore as the frontend sees it: values cross as JSON text, and a value
 *  over the subsystem's limit is refused the way `subsystemEntries` reports `entryTooLarge`. */
class MemorySubsystem implements TurnChangesStorage {
  entries = new Map<string, string>();
  sizeLimit: number;
  constructor(sizeLimit = TURN_CHANGES_SIZE_LIMIT) {
    this.sizeLimit = sizeLimit;
  }
  async getEntry(id: string) {
    const text = this.entries.get(id);
    return text === undefined ? undefined : (JSON.parse(text) as unknown);
  }
  async setEntry(id: string, value: unknown) {
    const text = JSON.stringify(value);
    if (new TextEncoder().encode(text).length > this.sizeLimit) throw new Error(`Failed to persist local storage entry ${TURN_CHANGES_SUBSYSTEM}:${id}: entryTooLarge`);
    this.entries.set(id, text);
  }
}

const ref: TurnRef = { sessionId: "ws-1", turnId: "t-1" };
const change = (path: string, additions = 1, deletions = 0): FileChange => ({ path, old_path: null, status: "modified", binary: false, additions, deletions });
const quiet = () => undefined;

test("the reference's subsystem: turn-changes-cache, 5 MiB, ids are the JSON pair [sessionId, turnId]", () => {
  assert.equal(TURN_CHANGES_SUBSYSTEM, "turn-changes-cache");
  assert.equal(TURN_CHANGES_SIZE_LIMIT, 5_242_880);
  assert.equal(turnCacheId(ref), '["ws-1","t-1"]');
  // Two UUIDs give the 79-character ids seen in Conductor's metadata.
  assert.equal(turnCacheId({ sessionId: crypto.randomUUID(), turnId: crypto.randomUUID() }).length, 79);
  assert.notEqual(turnCacheId({ sessionId: "a-b", turnId: "c" }), turnCacheId({ sessionId: "a", turnId: "b-c" }));
});

test("write then read round-trips the file list itself; other turns miss", async () => {
  const s = new MemorySubsystem();
  assert.equal(await writeCachedTurnChanges(s, ref, [change("a.ts")], quiet), true);
  assert.equal(s.entries.get('["ws-1","t-1"]'), JSON.stringify([change("a.ts")]));
  assert.deepEqual(await readCachedTurnChanges(s, ref, quiet), [change("a.ts")]);
  assert.equal(await readCachedTurnChanges(s, { ...ref, turnId: "t-2" }, quiet), undefined);
});

test("malformed or foreign entries, and failed reads, read as missing", async () => {
  const s = new MemorySubsystem();
  s.entries.set(turnCacheId(ref), JSON.stringify([{ path: "a", status: "weird" }]));
  assert.equal(await readCachedTurnChanges(s, ref, quiet), undefined);
  s.entries.set(turnCacheId(ref), JSON.stringify("a string"));
  assert.equal(await readCachedTurnChanges(s, ref, quiet), undefined);
  const logged: string[] = [];
  const broken = { getEntry: async () => { throw new Error("unreadable"); } };
  assert.equal(await readCachedTurnChanges(broken, ref, (m) => logged.push(m)), undefined);
  assert.deepEqual(logged, ["Failed to read turn changes from local storage"]);
});

test("a list too large for the subsystem, or a failed write, is logged and not stored", async () => {
  const s = new MemorySubsystem(1024);
  const logged: string[] = [];
  assert.equal(await writeCachedTurnChanges(s, ref, [{ ...change("x"), path: "p".repeat(2048) }], (m) => logged.push(m)), false);
  assert.equal(s.entries.size, 0);
  assert.deepEqual(logged, ["Failed to write turn changes to local storage"]);
});

test("load fetches once, shares concurrent requests, then serves memory", async () => {
  const s = new MemorySubsystem();
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
  assert.deepEqual(store.peek(ref), [change("a.ts")]);
});

test("after a restart the list comes from the subsystem, even without a worktree", async () => {
  const s = new MemorySubsystem();
  await createTurnChangesStore(s, async () => [change("a.ts")], quiet).load(ref, "/w");
  const again = createTurnChangesStore(s, async () => assert.fail("must not fetch"), quiet);
  assert.equal(again.peek(ref), undefined);
  let notified = 0;
  again.subscribe(() => notified++);
  assert.deepEqual(await again.load(ref, null), [change("a.ts")]);
  assert.equal(notified, 1);
  assert.deepEqual(again.peek(ref), [change("a.ts")]);
});

test("without a worktree and nothing stored, load gives undefined and does not fetch", async () => {
  const store = createTurnChangesStore(new MemorySubsystem(), async () => assert.fail("must not fetch"), quiet);
  assert.equal(await store.load(ref, null), undefined);
});

test("a failed load is not cached, so the next one retries", async () => {
  const s = new MemorySubsystem();
  let calls = 0;
  const store = createTurnChangesStore(s, async () => {
    calls++;
    if (calls === 1) throw new Error("checkpoints for turn t-1 are not ready");
    return [change("b.ts")];
  }, quiet);
  await assert.rejects(store.load(ref, "/w"), /not ready/);
  assert.equal(s.entries.size, 0);
  assert.deepEqual(await store.load(ref, "/w"), [change("b.ts")]);
  assert.equal(calls, 2);
});

test("a fetched list that storage refuses is still shown this run", async () => {
  const store = createTurnChangesStore(new MemorySubsystem(10), async () => [change("big.ts")], quiet);
  assert.deepEqual(await store.load(ref, "/w"), [change("big.ts")]);
  assert.deepEqual(store.peek(ref), [change("big.ts")]);
});

test("record keeps the list the turn ended with, writes it to the subsystem and notifies subscribers", async () => {
  const s = new MemorySubsystem();
  const store = createTurnChangesStore(s, async () => assert.fail("must not fetch"), quiet);
  let notified = 0;
  const off = store.subscribe(() => notified++);
  store.record(ref, [change("c.ts")]);
  assert.equal(notified, 1);
  assert.deepEqual(store.peek(ref), [change("c.ts")]);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(await readCachedTurnChanges(s, ref, quiet), [change("c.ts")]);
  off();
  store.record(ref, []);
  assert.equal(notified, 1);
});

test("entries our earlier builds left in the webview's localStorage are removed; other keys stay", () => {
  const items = new Map([
    ['openconductor.turn-changes-cache:["a","t1"]', "[]"],
    ['openconductor.turn-changes-cache:["a","t2"]', "[]"],
    ["openconductor.diff.view-options", "{}"],
  ]);
  const ls = {
    get length() {
      return items.size;
    },
    key: (i: number) => [...items.keys()][i] ?? null,
    removeItem: (k: string) => void items.delete(k),
  };
  assert.equal(dropLegacyTurnCache(ls), 2);
  assert.deepEqual([...items.keys()], ["openconductor.diff.view-options"]);
  assert.equal(dropLegacyTurnCache(ls), 0);
});

test("chips: up to 3 files all show; more show 2 and reveal 3 per click", () => {
  const files = (n: number) => Array.from({ length: n }, (_, i) => change(`f${i}`, i + 1, 1));
  assert.deepEqual(chipLayout(files(3), 0).more, null);
  assert.equal(chipLayout(files(3), 0).shown.length, 3);

  const eight = chipLayout(files(8), 0);
  assert.equal(eight.shown.length, 2);
  assert.equal(eight.more, "Show 3 more changed files");
  assert.deepEqual(eight.hiddenTotals, { additions: 3 + 4 + 5 + 6 + 7 + 8, deletions: 6 });
  assert.equal(chipLayout(files(8), 1).shown.length, 5);
  assert.equal(chipLayout(files(8), 1).more, "Show 3 more changed files");
  assert.equal(chipLayout(files(6), 1).more, "Show 1 more changed file");
  assert.equal(chipLayout(files(8), 2).more, null);
  assert.equal(chipLayout([], 0).more, null);
});
