import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomSectionCollapse, CUSTOM_SECTION_COLLAPSE_ID } from "./customSectionCollapse.ts";
import { LocalStorageClient, persistStorage } from "../lib/local-storage/client.ts";
import { memoryInvoke } from "../lib/local-storage/memory.ts";
import { PERSIST_NAMES, ROUTE_USER_STATE } from "../lib/local-storage/subsystems.ts";

function memory(initial: string | null = null) {
  let saved = initial;
  const writes: string[] = [];
  return {
    writes,
    async getItem(id: string) { assert.equal(id, CUSTOM_SECTION_COLLAPSE_ID); return saved; },
    async setItem(id: string, value: string) { assert.equal(id, CUSTOM_SECTION_COLLAPSE_ID); writes.push(value); saved = value; },
  };
}

test("custom section collapse survives a new store and re-expansion survives another reload", async () => {
  const storage = memory();
  const first = new CustomSectionCollapse(storage);
  await first.load();
  assert.deepEqual([...first.getSnapshot()], []);
  first.toggle("focus");
  await first.flush();
  const second = new CustomSectionCollapse(storage);
  await second.load();
  assert.deepEqual([...second.getSnapshot()], ["focus"]);
  second.toggle("focus");
  await second.flush();
  const third = new CustomSectionCollapse(storage);
  await third.load();
  assert.deepEqual([...third.getSnapshot()], []);
});

test("early clicks override hydration without discarding other saved section IDs", async () => {
  let resolve!: (value: string) => void;
  const saved = memory();
  const reading = new Promise<string>((done) => { resolve = done; });
  const store = new CustomSectionCollapse({ ...saved, getItem: () => reading });
  const loading = store.load();
  store.toggle("focus");
  resolve(JSON.stringify(["focus", "later"]));
  await loading;
  await store.flush();
  assert.deepEqual([...store.getSnapshot()].sort(), ["focus", "later"]);
  assert.deepEqual(saved.writes.map((value) => JSON.parse(value)), [["focus", "later"]]);
});

test("two early clicks leave that section expanded, even if it was saved collapsed", async () => {
  const storage = memory(JSON.stringify(["focus", "other"]));
  const store = new CustomSectionCollapse(storage);
  const loading = store.load();
  store.toggle("focus");
  store.toggle("focus");
  await loading;
  await store.flush();
  assert.deepEqual([...store.getSnapshot()], ["other"]);
});

test("invalid storage defaults expanded without writing over it on load", async () => {
  for (const raw of ["bad json", "null", "{}", '["focus",42]', '"focus"']) {
    const storage = memory(raw);
    const store = new CustomSectionCollapse(storage);
    await store.load();
    assert.deepEqual([...store.getSnapshot()], []);
    assert.equal(storage.writes.length, 0);
  }
});

test("snapshots are immutable and notifications stop after unsubscribe", async () => {
  const store = new CustomSectionCollapse(memory());
  await store.load();
  const original = store.getSnapshot();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => { notifications++; });
  store.toggle("focus");
  assert.equal(original.size, 0);
  assert.notEqual(store.getSnapshot(), original);
  assert.equal(notifications, 1);
  unsubscribe();
  store.toggle("focus");
  await store.flush();
  assert.equal(notifications, 1);
});

test("writes serialize and a failed write does not poison later saves", async () => {
  let attempts = 0;
  const saved: string[] = [];
  const store = new CustomSectionCollapse({
    getItem: async () => null,
    setItem: async (_id, value) => {
      attempts++;
      if (attempts === 1) throw new Error("disk full");
      saved.push(value);
    },
  });
  await store.load();
  store.toggle("focus");
  await assert.rejects(store.flush(), /disk full/);
  store.toggle("other");
  await store.flush();
  assert.deepEqual(JSON.parse(saved[0]), ["focus", "other"]);
});

test("the backend adapter round-trips without overwriting Diff's persisted envelope", async () => {
  const storage = persistStorage(new LocalStorageClient(memoryInvoke()), ROUTE_USER_STATE);
  const diff = JSON.stringify({ state: { routeStates: { "workspace.changes/lisbon": { diffFileListMode: "tree" } } }, version: 0 });
  await storage.setItem(PERSIST_NAMES.routeUserState, diff);
  const first = new CustomSectionCollapse(storage);
  await first.load();
  first.toggle("focus");
  await first.flush();
  const second = new CustomSectionCollapse(storage);
  await second.load();
  assert.deepEqual([...second.getSnapshot()], ["focus"]);
  assert.equal(await storage.getItem(PERSIST_NAMES.routeUserState), diff);
});

test("overlapping saves complete in order and hydration is idempotent", async () => {
  let reads = 0;
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const values: string[] = [];
  const store = new CustomSectionCollapse({
    getItem: async () => { reads++; return null; },
    setItem: async (_id, value) => {
      if (values.length === 0) await blocked;
      values.push(value);
    },
  });
  await Promise.all([store.load(), store.load()]);
  store.toggle("focus");
  store.toggle("other");
  await Promise.resolve();
  assert.deepEqual(values, []);
  release();
  await store.flush();
  assert.equal(reads, 1);
  assert.deepEqual(values.map((value) => JSON.parse(value)), [["focus"], ["focus", "other"]]);
});

test("failed reads never overwrite unknown saved state", async () => {
  const storage = memory();
  const store = new CustomSectionCollapse({ ...storage, getItem: async () => { throw new Error("unavailable"); } });
  await assert.rejects(store.load(), /unavailable/);
  store.toggle("focus");
  assert.deepEqual([...store.getSnapshot()], ["focus"]);
  await assert.rejects(store.flush(), /unavailable/);
  assert.equal(storage.writes.length, 0);
});
