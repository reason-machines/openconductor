import { test } from "node:test";
import assert from "node:assert/strict";
import { RECENT_LIMIT, RECENT_STORAGE_KEY, loadRecentWorkspaceIds, recordViewedWorkspace, saveRecentWorkspaceIds } from "./recentWorkspaces.ts";

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

test("recordViewedWorkspace puts the id first, drops its old place and keeps 5", () => {
  assert.equal(RECENT_LIMIT, 5);
  let ids: readonly string[] = [];
  for (const id of ["a", "b", "c", "d", "e", "f"]) ids = recordViewedWorkspace(ids, id);
  assert.deepEqual(ids, ["f", "e", "d", "c", "b"]);
  assert.deepEqual(recordViewedWorkspace(ids, "c"), ["c", "f", "e", "d", "b"]);
  // Already first: the same list comes back (no store update).
  assert.equal(recordViewedWorkspace(ids, "f"), ids);
});

test("the list survives a save and a fresh load, beside other stored fields", () => {
  const storage = memoryStorage({ [RECENT_STORAGE_KEY]: JSON.stringify({ state: { lastRoute: "/x" }, version: 0 }) });
  saveRecentWorkspaceIds(["w2", "w1"], storage);
  assert.deepEqual(loadRecentWorkspaceIds(storage), ["w2", "w1"]);
  assert.deepEqual(JSON.parse(storage.data.get(RECENT_STORAGE_KEY)!), { state: { lastRoute: "/x", recentWorkspaceIds: ["w2", "w1"] }, version: 0 });
});

test("a missing or malformed store reads as empty, and the load caps at 5", () => {
  assert.deepEqual(loadRecentWorkspaceIds(memoryStorage()), []);
  assert.deepEqual(loadRecentWorkspaceIds(memoryStorage({ [RECENT_STORAGE_KEY]: "{not json" })), []);
  assert.deepEqual(loadRecentWorkspaceIds(memoryStorage({ [RECENT_STORAGE_KEY]: '{"state":{"recentWorkspaceIds":"a"}}' })), []);
  const many = { state: { recentWorkspaceIds: ["a", 3, "b", "a", "c", "d", "e", "f", "g"] } };
  assert.deepEqual(loadRecentWorkspaceIds(memoryStorage({ [RECENT_STORAGE_KEY]: JSON.stringify(many) })), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(loadRecentWorkspaceIds(undefined), []);
});
