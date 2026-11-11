// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TABS, emptyTabs, tabsReducer, terminalTabs, type TabsAction, type TabsState } from "./tabs.ts";
import { AckBatcher, parsePtyEvent } from "./events.ts";

const run = (actions: TabsAction[], s: TabsState = emptyTabs()) => actions.reduce(tabsReducer, s);

test("center terminals keep their placement through lifecycle changes", () => {
  let s = run([
    { type: "open", id: "panel" },
    { type: "open", id: "center", placement: "center" },
    { type: "ready", id: "center" },
    { type: "program", id: "center", runningProgram: "codex" },
    { type: "exit", id: "center", exitCode: 0, signal: null },
  ]);
  assert.equal(s.tabs.find((t) => t.id === "center")?.placement, "center");
  assert.equal(s.activeId, "panel", "a center tab does not change the right-panel selection");
  assert.deepEqual(terminalTabs(s, "panel").map((t) => t.id), ["panel"]);
  assert.deepEqual(terminalTabs(s, "center").map((t) => t.id), ["center"]);
  s = tabsReducer(s, { type: "close", id: "center" });
  assert.equal(s.activeId, "panel");
});

test("closing a panel tab never selects a center terminal", () => {
  const s = run([
    { type: "open", id: "p1" }, { type: "open", id: "p2" },
    { type: "open", id: "center", placement: "center" },
    { type: "close", id: "p2" },
  ]);
  assert.equal(s.activeId, "p1");
  assert.equal(tabsReducer(s, { type: "close", id: "p1" }).activeId, null);
});

test("opening tabs numbers them, selects the new one and stops at the limit", () => {
  const s = run([{ type: "open", id: "a" }, { type: "open", id: "b" }, { type: "open", id: "b" }]);
  assert.deepEqual(s.tabs.map((t) => [t.id, t.title, t.status]), [
    ["a", "Terminal 1", "starting"],
    ["b", "Terminal 2", "starting"],
  ]);
  assert.equal(s.activeId, "b");

  const full = run(Array.from({ length: MAX_TABS + 2 }, (_, i) => ({ type: "open", id: `t${i}` }) as const));
  assert.equal(full.tabs.length, MAX_TABS);
});

test("closing a panel terminal selects its predecessor or first remaining terminal", () => {
  const opened = run([
    { type: "open", id: "a" },
    { type: "open", id: "center", placement: "center" },
    { type: "open", id: "b" },
    { type: "open", id: "c" },
  ]);
  for (const [selected, closed, expected] of [
    ["b", "b", "a"],
    ["a", "a", "b"],
    ["c", "c", "b"],
    ["b", "a", "b"],
    ["b", "c", "b"],
    ["b", "center", "b"],
  ]) {
    const state = run([{ type: "select", id: selected }, { type: "close", id: closed }], opened);
    assert.equal(state.activeId, expected, `selected ${selected}, closed ${closed}`);
    assert.deepEqual(state.tabs.map((tab) => tab.id), opened.tabs.filter((tab) => tab.id !== closed).map((tab) => tab.id));
  }
});

test("closing the active tab selects its predecessor; numbers are not reused", () => {
  const opened = run(["a", "b", "c"].map((id) => ({ type: "open", id }) as const));
  let s = run([{ type: "select", id: "b" }, { type: "close", id: "b" }], opened);
  assert.equal(s.activeId, "a");
  s = run([{ type: "close", id: "c" }], s);
  assert.equal(s.activeId, "a");
  s = run([{ type: "close", id: "a" }, { type: "open", id: "d" }], s);
  assert.deepEqual([s.activeId, s.tabs[0].title], ["d", "Terminal 4"]);
  // Closing a background tab keeps the selection.
  s = run([{ type: "open", id: "e" }, { type: "close", id: "d" }], s);
  assert.equal(s.activeId, "e");
});

test("ready and exit update status; unknown ids change nothing", () => {
  const s = run([
    { type: "open", id: "a" },
    { type: "ready", id: "a" },
    { type: "exit", id: "a", exitCode: 130, signal: "SIGINT" },
    { type: "ready", id: "a" },
  ]);
  assert.deepEqual(s.tabs[0], { id: "a", title: "Terminal 1", status: "exited", exitCode: 130, signal: "SIGINT" });
  assert.equal(tabsReducer(s, { type: "exit", id: "zz", exitCode: 0, signal: null }), s);
});

test("pty events decode base64 bytes and reject malformed payloads", () => {
  const data = parsePtyEvent({ kind: "data", id: "a", data: "aMM=" });
  assert.deepEqual(data, { kind: "data", id: "a", data: new Uint8Array([0x68, 0xc3]) });
  assert.deepEqual(parsePtyEvent({ kind: "ready", id: "a", pid: 7 }), { kind: "ready", id: "a", pid: 7 });
  assert.deepEqual(parsePtyEvent({ kind: "exit", id: "a", exitCode: 0 }), { kind: "exit", id: "a", exitCode: 0, signal: null });
  assert.throws(() => parsePtyEvent({ kind: "data", id: "a", data: 5 }), /Invalid PTY data payload/);
  assert.throws(() => parsePtyEvent({ kind: "exit", id: "a" }), /Invalid PTY exit payload/);
  assert.throws(() => parsePtyEvent(null), /Invalid PTY/);
});

test("acks batch at the threshold and flush after a quiet period", () => {
  const sent: number[] = [];
  const timers: Array<() => void> = [];
  const ack = new AckBatcher(
    (n) => sent.push(n),
    100,
    30,
    (f) => (timers.push(f), timers.length as unknown as ReturnType<typeof setTimeout>),
    () => {},
  );
  ack.rendered(60);
  assert.deepEqual(sent, []);
  ack.rendered(50);
  assert.deepEqual(sent, [110]);
  ack.rendered(5);
  timers.at(-1)!();
  assert.deepEqual(sent, [110, 5]);
  ack.flush();
  assert.deepEqual(sent, [110, 5], "nothing pending, nothing sent");
});

test("timer functions are called unbound (browsers reject setTimeout with another `this`)", () => {
  const sent: number[] = [];
  let pending: (() => void) | null = null;
  const ack = new AckBatcher(
    (n) => sent.push(n),
    100,
    30,
    function (this: unknown, f) {
      assert.equal(this, undefined, "schedule must not be called as a method");
      pending = f;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    },
    function (this: unknown) {
      assert.equal(this, undefined, "cancel must not be called as a method");
    },
  );
  ack.rendered(5);
  pending!();
  assert.deepEqual(sent, [5]);
});
