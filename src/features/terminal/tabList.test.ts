// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TABS_STORAGE_KEY,
  TabListStore,
  decodeLegacyTabList,
  decodeTabList,
  emptyTabList,
  encodeTabList,
  savedWorkspace,
  type AsyncKeyValue,
  type TabList,
} from "./tabList.ts";
import { emptyTabs, tabsReducer, type TabsAction, type TabsState } from "./tabs.ts";

const run = (actions: TabsAction[], s: TabsState = emptyTabs()) => actions.reduce(tabsReducer, s);

/** An async store whose writes can be held, failed, and inspected. */
function memory(init: Record<string, string> = {}) {
  const data: Record<string, string> = { ...init };
  const writes: string[] = [];
  let failReads = false;
  let failWrites = false;
  const kv: AsyncKeyValue = {
    async getItem(k) {
      await Promise.resolve();
      if (failReads) throw new Error("read failed");
      return data[k] ?? null;
    },
    async setItem(k, v) {
      await new Promise((r) => setTimeout(r, 1));
      if (failWrites) throw new Error("subsystemFull");
      writes.push(v);
      data[k] = v;
    },
  };
  return {
    kv,
    data,
    writes,
    failReads: () => (failReads = true),
    failWrites: (on = true) => (failWrites = on),
  };
}

// The record in Sven's Conductor `terminal` subsystem has this shape (ids shortened):
// one terminal with only id, localWorkspaceId and startingCommandRan.
const REFERENCE = JSON.stringify({
  state: {
    terminals: [
      { id: "w1-aaaa", localWorkspaceId: "w1", startingCommandRan: false },
      { id: "w1-bbbb", cwd: "/repo/sub", hostKind: "local", localWorkspaceId: "w1", startingCommandRan: true },
      { id: "repo-r1-cccc", repositoryId: "r1" },
      { id: "w2-dddd", localWorkspaceId: "w2", startingCommandRan: false },
    ],
    workspaceTerminals: [
      ["w1", ["w1-aaaa", "w1-bbbb", "missing"]],
      ["w2", ["w2-dddd"]],
      ["w3", ["repo-r1-cccc"]],
    ],
    activeTabPerWorkspace: [
      ["w1", "w1-bbbb"],
      ["w2", "run"],
    ],
    lastTabKind: "terminal",
  },
  version: 2,
});

test("the reference's persisted tab list reads as its store merges it", () => {
  assert.deepEqual(decodeTabList(REFERENCE), {
    workspaces: {
      w1: {
        tabs: [
          { id: "w1-aaaa", title: "Terminal 1" },
          { id: "w1-bbbb", title: "Terminal 2", cwd: "/repo/sub" },
        ],
        activeId: "w1-bbbb",
        next: 3,
      },
      // "run" is the run-script tab, which we do not have: the first tab is selected.
      w2: { tabs: [{ id: "w2-dddd", title: "Terminal 1" }], activeId: "w2-dddd", next: 2 },
      // A repository terminal has no workspace id, so w3 is left empty and dropped.
    },
    lastTabKind: "terminal",
  });
});

test("version 1 records name the workspace workspaceId", () => {
  const v1 = JSON.stringify({
    state: { terminals: [{ id: "t", workspaceId: "w1" }], workspaceTerminals: [["w1", ["t"]]] },
    version: 1,
  });
  assert.deepEqual(decodeTabList(v1).workspaces.w1.tabs, [{ id: "t", title: "Terminal 1" }]);
  const v2 = JSON.stringify({ state: { terminals: [{ id: "t", workspaceId: "w1" }], workspaceTerminals: [["w1", ["t"]]] }, version: 2 });
  assert.deepEqual(decodeTabList(v2).workspaces, {});
});

test("unreadable lists read as empty", () => {
  for (const text of [null, "{not json", "[1]", '"x"', '{"state":3}', '{"state":{"workspaceTerminals":"x"}}']) {
    assert.deepEqual(decodeTabList(text), emptyTabList(), String(text));
  }
  assert.equal(emptyTabList().lastTabKind, "spotlight", "the reference's default");
});

test("our list encodes in the reference's shape and round-trips", () => {
  const list: TabList = {
    workspaces: {
      A: { tabs: [{ id: "a1", title: "Terminal 1", cwd: "/a" }, { id: "a3", title: "Terminal 3", cwd: "/a/x" }], activeId: "a3", next: 4 },
      B: { tabs: [{ id: "b1", title: "Terminal 1" }], activeId: null, next: 2 },
    },
    lastTabKind: "terminal",
  };
  const text = encodeTabList(list);
  assert.deepEqual(JSON.parse(text), {
    state: {
      terminals: [
        { id: "a1", cwd: "/a", localWorkspaceId: "A", startingCommandRan: false, title: "Terminal 1" },
        { id: "a3", cwd: "/a/x", localWorkspaceId: "A", startingCommandRan: false, title: "Terminal 3" },
        { id: "b1", localWorkspaceId: "B", startingCommandRan: false, title: "Terminal 1" },
      ],
      workspaceTerminals: [
        ["A", ["a1", "a3"]],
        ["B", ["b1"]],
      ],
      activeTabPerWorkspace: [["A", "a3"]],
      lastTabKind: "terminal",
      titleCounters: [
        ["A", 4],
        ["B", 2],
      ],
    },
    version: 2,
  });
  const back = decodeTabList(text);
  assert.deepEqual(back.workspaces.A, list.workspaces.A);
  // No saved active tab selects the first, as the reference's panel does.
  assert.deepEqual(back.workspaces.B, { ...list.workspaces.B, activeId: "b1" });
});

test("our earlier localStorage format still reads", () => {
  const old = JSON.stringify({
    A: { tabs: [{ id: "x", title: "T", cwd: "/" }, { id: 3 }, null], activeId: "missing", next: -1 },
    B: { tabs: "nope" },
    C: { tabs: [{ id: "c", title: "Terminal 4", cwd: "/c" }], activeId: "c", next: 5 },
  });
  assert.deepEqual(decodeLegacyTabList(old).workspaces, {
    A: { tabs: [{ id: "x", title: "T", cwd: "/" }], activeId: "x", next: 2 },
    C: { tabs: [{ id: "c", title: "Terminal 4", cwd: "/c" }], activeId: "c", next: 5 },
  });
  assert.deepEqual(decodeLegacyTabList("{bad"), emptyTabList());
});

test("only tabs with a live terminal are saved; none saves nothing", () => {
  const s = run([{ type: "open", id: "a1" }, { type: "open", id: "gone" }, { type: "select", id: "a1" }]);
  assert.deepEqual(savedWorkspace(s, (id) => (id === "a1" ? "/a" : undefined)), {
    tabs: [{ id: "a1", title: "Terminal 1", cwd: "/a" }],
    activeId: "a1",
    next: 3,
  });
  assert.equal(savedWorkspace(s, () => undefined), undefined);
});

test("the store applies changes in order, writes them whole, and keeps other workspaces", async () => {
  const m = memory({ [TABS_STORAGE_KEY]: REFERENCE });
  const store = new TabListStore(m.kv);
  const a = { tabs: [{ id: "a1", title: "Terminal 1", cwd: "/a" }], activeId: "a1", next: 2 };
  // Not awaited: they must still land in call order.
  void store.setWorkspace("A", a, "terminal");
  void store.setWorkspace("w2", undefined);
  assert.deepEqual(await store.workspace("A"), a);
  assert.equal(await store.workspace("w2"), undefined);
  const saved = decodeTabList(m.data[TABS_STORAGE_KEY]);
  assert.deepEqual(Object.keys(saved.workspaces), ["w1", "A"]);
  assert.equal(m.writes.length, 2);
});

test("a list that could not be read is never overwritten", async () => {
  const m = memory({ [TABS_STORAGE_KEY]: REFERENCE });
  m.failReads();
  const errors: unknown[] = [];
  const store = new TabListStore(m.kv, undefined, (e) => errors.push(e));
  assert.equal(await store.workspace("w1"), undefined);
  await store.setWorkspace("A", { tabs: [{ id: "a", title: "Terminal 1" }], activeId: "a", next: 2 });
  assert.equal(m.data[TABS_STORAGE_KEY], REFERENCE);
  assert.equal(m.writes.length, 0);
  assert.equal(errors.length, 1);
});

test("a failed write is reported and later changes still save", async () => {
  const m = memory();
  const errors: unknown[] = [];
  const store = new TabListStore(m.kv, undefined, (e) => errors.push(e));
  m.failWrites();
  await store.setWorkspace("A", { tabs: [{ id: "a", title: "Terminal 1" }], activeId: "a", next: 2 });
  assert.equal(errors.length, 1);
  m.failWrites(false);
  await store.setWorkspace("B", { tabs: [{ id: "b", title: "Terminal 1" }], activeId: "b", next: 2 });
  // The whole list is written, so the change that failed to save is in this write too.
  assert.deepEqual(Object.keys(decodeTabList(m.data[TABS_STORAGE_KEY]).workspaces), ["A", "B"]);
});

test("our earlier localStorage list moves into the store once", async () => {
  const m = memory();
  const legacy: Record<string, string> = {
    [TABS_STORAGE_KEY]: JSON.stringify({ A: { tabs: [{ id: "a", title: "Terminal 2", cwd: "/a" }], activeId: "a", next: 3 } }),
  };
  const local = { getItem: (k: string) => legacy[k] ?? null, removeItem: (k: string) => void delete legacy[k] };
  const store = new TabListStore(m.kv, local);
  assert.deepEqual(await store.workspace("A"), { tabs: [{ id: "a", title: "Terminal 2", cwd: "/a" }], activeId: "a", next: 3 });
  assert.equal(legacy[TABS_STORAGE_KEY], undefined, "removed from localStorage after the move");
  assert.deepEqual(decodeTabList(m.data[TABS_STORAGE_KEY]).workspaces.A.next, 3);

  // When the store already has a list, localStorage is left alone.
  legacy[TABS_STORAGE_KEY] = "{}";
  const again = new TabListStore(m.kv, local);
  await again.workspace("A");
  assert.equal(legacy[TABS_STORAGE_KEY], "{}");
});

test("a move that cannot be written keeps the localStorage copy", async () => {
  const m = memory();
  m.failWrites();
  const legacy: Record<string, string> = { [TABS_STORAGE_KEY]: JSON.stringify({ A: { tabs: [{ id: "a", title: "T", cwd: "/" }], activeId: "a", next: 2 } }) };
  const local = { getItem: (k: string) => legacy[k] ?? null, removeItem: (k: string) => void delete legacy[k] };
  const store = new TabListStore(m.kv, local);
  assert.equal(await store.workspace("A"), undefined);
  assert.ok(legacy[TABS_STORAGE_KEY], "kept for the next launch");
});
