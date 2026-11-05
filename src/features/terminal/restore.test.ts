// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PERSIST_DELAY_MS,
  PersistThrottle,
  TABS_STORAGE_KEY,
  readSaved,
  restoreCwds,
  restoreOutput,
  writeWorkspace,
  type HistoryRecord,
  type KeyValue,
  type Timers,
} from "./restore.ts";
import { emptyTabs, tabsReducer, type TabsAction, type TabsState } from "./tabs.ts";

const memory = (init: Record<string, string> = {}): KeyValue & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const run = (actions: TabsAction[], s: TabsState = emptyTabs()) => actions.reduce(tabsReducer, s);

const record = (over: Partial<HistoryRecord> = {}): HistoryRecord => ({
  localWorkspaceId: "ws",
  sessionId: "term-1",
  startedAt: "2026-11-05T10:00:00.000Z",
  endedAt: null,
  hasReceivedUserInput: true,
  snapshotAnsi: "$ ls\r\nREADME.md\r\n$ ",
  rehydrateSequences: "\x1b[?2004h",
  cwd: "/repo/sub",
  cols: 100,
  rows: 30,
  alternateScreen: false,
  bracketedPaste: true,
  ...over,
});

test("a workspace's tabs round-trip through storage, leaving other workspaces alone", () => {
  const store = memory();
  const a = run([{ type: "open", id: "a1" }, { type: "open", id: "a2" }, { type: "select", id: "a1" }]);
  const b = run([{ type: "open", id: "b1" }]);
  writeWorkspace(store, "A", a, () => "/a");
  writeWorkspace(store, "B", b, () => "/b");
  writeWorkspace(store, "A", run([{ type: "close", id: "a2" }], a), () => "/a");

  assert.deepEqual(readSaved(store), {
    A: { tabs: [{ id: "a1", title: "Terminal 1", cwd: "/a" }], activeId: "a1", next: 3 },
    B: { tabs: [{ id: "b1", title: "Terminal 1", cwd: "/b" }], activeId: "b1", next: 2 },
  });

  // Closing a workspace's last tab drops its entry.
  writeWorkspace(store, "B", run([{ type: "close", id: "b1" }], b), () => "/b");
  assert.deepEqual(Object.keys(readSaved(store)), ["A"]);
});

test("tabs with no live terminal are not saved", () => {
  const store = memory();
  writeWorkspace(store, "A", run([{ type: "open", id: "a1" }, { type: "open", id: "gone" }]), (id) => (id === "a1" ? "/a" : undefined));
  assert.deepEqual(readSaved(store).A.tabs.map((t) => t.id), ["a1"]);
});

test("unreadable or malformed saved tabs read as none, keeping the valid parts", () => {
  assert.deepEqual(readSaved(memory({ [TABS_STORAGE_KEY]: "{not json" })), {});
  assert.deepEqual(readSaved(memory({ [TABS_STORAGE_KEY]: "[1,2]" })), {});
  const saved = readSaved(
    memory({
      [TABS_STORAGE_KEY]: JSON.stringify({
        A: { tabs: [{ id: "x", title: "T", cwd: "/" }, { id: 3 }, null], activeId: "missing", next: -1 },
        B: { tabs: "nope" },
      }),
    }),
  );
  assert.deepEqual(saved, { A: { tabs: [{ id: "x", title: "T", cwd: "/" }], activeId: "x", next: 2 } });
});

test("restored tabs keep their titles, active tab and counter", () => {
  const s = run([
    { type: "open", id: "t2", title: "Terminal 2" },
    { type: "open", id: "t5", title: "Terminal 5" },
    { type: "restored", activeId: "t2", next: 6 },
    { type: "open", id: "new" },
  ]);
  assert.deepEqual(s.tabs.map((t) => t.title), ["Terminal 2", "Terminal 5", "Terminal 6"]);
  assert.equal(run([{ type: "open", id: "t2", title: "Terminal 2" }, { type: "open", id: "t5", title: "Terminal 5" }, { type: "restored", activeId: "t2", next: 6 }]).activeId, "t2");
  // An active id that failed to restore keeps the current selection.
  assert.equal(run([{ type: "open", id: "t1", title: "Terminal 1" }, { type: "restored", activeId: "dead", next: 2 }]).activeId, "t1");
});

test("restore output replays modes, then the screen, then the reference's grey divider", () => {
  assert.equal(
    restoreOutput(record()),
    "\x1b[?2004h$ ls\r\nREADME.md\r\n$ \r\n\x1b[90m--- Previous terminal session restored. Starting new shell... ---\x1b[0m\r\n",
  );
});

test("a restored shell starts in the saved cwd, falling back to the workspace's", () => {
  assert.deepEqual(restoreCwds(record(), "/repo"), ["/repo/sub", "/repo"]);
  assert.deepEqual(restoreCwds(record({ cwd: "/repo" }), "/repo"), ["/repo"]);
  assert.deepEqual(restoreCwds(record({ cwd: null }), "/repo"), ["/repo"]);
  assert.deepEqual(restoreCwds(undefined, "/repo"), ["/repo"]);
});

function fakeTimers() {
  let now = 0;
  const queue: { at: number; f: () => void; handle: number }[] = [];
  let seq = 0;
  const timers: Timers = {
    set: (f, ms) => (queue.push({ at: now + ms, f, handle: ++seq }), seq),
    clear: (h) => {
      const i = queue.findIndex((q) => q.handle === h);
      if (i >= 0) queue.splice(i, 1);
    },
  };
  const advance = async (ms: number) => {
    now += ms;
    for (const due of queue.filter((q) => q.at <= now)) {
      queue.splice(queue.indexOf(due), 1);
      due.f();
    }
    await new Promise((r) => setImmediate(r));
  };
  return { timers, advance };
}

test("bursts of output save once, within the delay, and output during a save is not starved", async () => {
  const { timers, advance } = fakeTimers();
  const saves: string[] = [];
  const p = new PersistThrottle(async (id) => void saves.push(id), timers);
  for (let i = 0; i < 50; i++) p.schedule("a");
  p.schedule("b");
  await advance(PERSIST_DELAY_MS - 1);
  assert.deepEqual(saves, []);
  // Output keeps arriving: the save still happens at the delay, not after a quiet spell.
  p.schedule("a");
  await advance(1);
  assert.deepEqual(saves.sort(), ["a", "b"]);
  p.schedule("a");
  await advance(PERSIST_DELAY_MS);
  assert.deepEqual(saves.sort(), ["a", "a", "b"]);
});

test("flush saves now and replaces a pending save; cancel drops it", async () => {
  const { timers, advance } = fakeTimers();
  const saves: string[] = [];
  const p = new PersistThrottle(async (id) => void saves.push(id), timers);
  p.schedule("a");
  await p.flush("a");
  assert.deepEqual(saves, ["a"]);
  assert.equal(p.isPending("a"), false);
  p.schedule("b");
  p.cancel("b");
  await advance(PERSIST_DELAY_MS * 2);
  assert.deepEqual(saves, ["a"]);
});

test("saves of one terminal never overlap, and a failed save does not stop the next", async () => {
  const { timers } = fakeTimers();
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const p = new PersistThrottle(async () => {
    calls++;
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    if (calls === 1) throw new Error("disk full");
  }, timers);
  await Promise.all([p.flush("a"), p.flush("a"), p.flush("a")]);
  assert.equal(calls, 3);
  assert.equal(maxRunning, 1);
});
