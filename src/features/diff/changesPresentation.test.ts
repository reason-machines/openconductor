import { test } from "node:test";
import assert from "node:assert/strict";
import { ChangesPresentationStore, parseChangesPresentation, type ChangesStorage } from "./changesPresentation.ts";
import { PERSIST_NAMES, routeStateKey } from "../../lib/local-storage/subsystems.ts";

const key = (id: string) => routeStateKey({ routeId: "workspace.changes", scope: [id] });
function disk(initial: unknown = null) {
  let value: string | null = initial === null ? null : JSON.stringify(initial);
  const storage: ChangesStorage = { getItem: async () => value, setItem: async (_id, next) => { value = next; } };
  return { storage, content: () => JSON.parse(value ?? "null") };
}
const tree = { diffFileListMode: "tree", filePathFilter: "test", collapsedDirectoryPaths: ["src/lib"] } as const;

test("Changes presentation survives reconstruction without sharing values between workspaces", async () => {
  const { storage } = disk();
  const store = new ChangesPresentationStore(storage);
  await store.ready;
  store.update("lisbon", { ...tree, collapsedDirectoryPaths: [...tree.collapsedDirectoryPaths] });
  store.update("porto", { collapsedDirectoryPaths: ["scripts"] });
  await store.flush();
  const restarted = new ChangesPresentationStore(storage);
  await restarted.ready;
  assert.deepEqual(restarted.get("lisbon"), tree);
  assert.deepEqual(restarted.get("porto"), { diffFileListMode: "flat", filePathFilter: "", collapsedDirectoryPaths: ["scripts"] });
  assert.equal(restarted.get("lisbon"), restarted.get("lisbon"), "snapshots stay stable until changed");
});

test("early edits survive delayed hydration without overwriting saved fields or sibling routes", async () => {
  const original = { state: { routeStates: { [key("lisbon")]: { ...tree, other: 42 }, "workspace.files/porto": { openDirectoryPaths: ["src"] } } }, version: 0 };
  const { storage, content } = disk(original);
  let release: (value: string | null) => void = () => { throw new Error("read not started"); };
  storage.getItem = async (id) => {
    assert.equal(id, PERSIST_NAMES.routeUserState);
    return new Promise((resolve) => { release = resolve; });
  };
  const store = new ChangesPresentationStore(storage);
  store.update("lisbon", { filePathFilter: "auth" });
  store.update("porto", { diffFileListMode: "tree" });
  release(JSON.stringify(original));
  await store.flush();
  assert.deepEqual(store.get("lisbon"), { ...tree, filePathFilter: "auth" });
  assert.deepEqual(content().state.routeStates["workspace.files/porto"], { openDirectoryPaths: ["src"] });
  assert.equal(content().state.routeStates[key("lisbon")].other, 42);
  assert.equal(content().state.routeStates[key("porto")].diffFileListMode, "tree");
});

test("an early folder toggle applies to saved collapsed paths after hydration", async () => {
  const original = { state: { routeStates: { [key("lisbon")]: { ...tree, collapsedDirectoryPaths: ["scripts"] } } }, version: 0 };
  const { storage } = disk(original);
  let release: (value: string | null) => void = () => { throw new Error("read not started"); };
  storage.getItem = async () => new Promise((resolve) => { release = resolve; });
  const store = new ChangesPresentationStore(storage);
  store.update("lisbon", (previous) => ({ collapsedDirectoryPaths: [...previous.collapsedDirectoryPaths, "src/lib"] }));
  release(JSON.stringify(original));
  await store.flush();
  assert.deepEqual(store.get("lisbon").collapsedDirectoryPaths, ["scripts", "src/lib"]);
});

test("a failed read cannot erase unseen routes and a later edit retries hydration", async () => {
  const original = { state: { routeStates: { "workspace.files/porto": { openDirectoryPaths: ["src"] }, [key("lisbon")]: tree } }, version: 0 };
  const { storage, content } = disk(original);
  const read = storage.getItem;
  let reads = 0;
  storage.getItem = async (id) => { if (++reads === 1) throw new Error("temporarily unavailable"); return read(id); };
  const errors: string[] = [];
  const store = new ChangesPresentationStore(storage, (message) => errors.push(message));
  store.update("lisbon", { filePathFilter: "auth" });
  await store.flush();
  assert.deepEqual(content(), original, "a failed read must not write an empty envelope");
  store.update("lisbon", { diffFileListMode: "flat" });
  await store.flush();
  assert.equal(reads, 2);
  assert.deepEqual(content().state.routeStates["workspace.files/porto"], original.state.routeStates["workspace.files/porto"]);
  assert.deepEqual(store.get("lisbon"), { ...tree, diffFileListMode: "flat", filePathFilter: "auth" });
});

test("writes remain ordered when a previous save is slow", async () => {
  const { storage } = disk();
  const saved: string[] = [];
  let release: () => void = () => { throw new Error("write not started"); };
  storage.setItem = async (_id, value) => {
    saved.push(value);
    if (saved.length === 1) await new Promise<void>((resolve) => { release = resolve; });
  };
  const store = new ChangesPresentationStore(storage);
  await store.ready;
  store.update("lisbon", { filePathFilter: "a" });
  store.update("lisbon", { filePathFilter: "auth" });
  await Promise.resolve();
  assert.equal(saved.length, 1);
  release();
  await store.flush();
  assert.equal(saved.length, 2);
  assert.equal(JSON.parse(saved[1]).state.routeStates[key("lisbon")].filePathFilter, "auth");
});

test("invalid persisted fields independently fall back to defaults", () => {
  const defaults = { diffFileListMode: "flat", filePathFilter: "", collapsedDirectoryPaths: [] };
  for (const invalid of [null, [], 3, "tree"]) assert.deepEqual(parseChangesPresentation(invalid), defaults);
  assert.deepEqual(parseChangesPresentation({ diffFileListMode: "tree", filePathFilter: 42, collapsedDirectoryPaths: ["src", null] }), { ...defaults, diffFileListMode: "tree" });
  assert.deepEqual(parseChangesPresentation({ diffFileListMode: "bad", filePathFilter: "auth", collapsedDirectoryPaths: ["src"] }), { ...defaults, filePathFilter: "auth", collapsedDirectoryPaths: ["src"] });
});

test("storage failures leave the current list usable and later writes can recover", async () => {
  const errors: string[] = [];
  const { storage } = disk();
  let fail = true;
  storage.setItem = async () => { if (fail) throw new Error("full"); };
  const store = new ChangesPresentationStore(storage, (message) => errors.push(message));
  await store.ready;
  store.update("lisbon", { diffFileListMode: "tree" });
  await store.flush();
  assert.equal(store.get("lisbon").diffFileListMode, "tree");
  assert.equal(errors.length, 1);
  fail = false;
  store.update("lisbon", { filePathFilter: "auth" });
  await store.flush();
  assert.equal(errors.length, 1);
});
