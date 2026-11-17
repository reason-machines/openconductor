import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Additional lifecycle boundaries; the five-case frozen fixture in src/ is unchanged.
// Execute OpenConductor methods only, with no app, actual DOM, xterm, PTY or reference JS.
const file = "src/features/terminal/session.ts";
const source = readFileSync(process.env.TERMINAL_SESSION_SOURCE ?? file, "utf8");
const begin = source.indexOf("export function attachTab(");
const end = source.indexOf("\nfunction writeInput(", begin);
const dispose = source.indexOf("\nfunction dispose(");
assert.ok(begin >= 0 && end > begin && dispose > end);
const body = stripTypeScriptTypes(source.slice(begin, end).replace(/^export /, "") + source.slice(dispose));

function fixture() {
  const live = new Map();
  const findRequests = new Map([["term", 1]]);
  const observers = [];
  const errors = [];
  let fits = 0;
  let disposed = 0;
  let appearancesDisconnected = 0;
  let removes = 0;
  let failOpen = false;
  const makeTerminal = () => ({
    host: { parentElement: null, clientWidth: 640, remove() { removes++; this.parentElement = null; } },
    opened: false, quiet: false,
    term: {
      open() { if (failOpen) throw new Error("synthetic open failure"); },
      focus() {}, dispose() { disposed++; },
    },
    fit: { fit() { fits++; } },
    appearance: { disconnect() { appearancesDisconnected++; } },
  });
  const terminal = makeTerminal();
  live.set("term", terminal);
  class ResizeObserver {
    disconnected = false;
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const api = runInNewContext(`${body}\n({ attachTab, dispose })`, {
    live, findRequests, ResizeObserver, typingElsewhere: () => false,
    console: { error() {} }, ATTACH_FAILED: "Failed to attach terminal",
    attachFailureListeners: new Set([(error) => errors.push(error)]),
  });
  const container = () => ({ appendChild(child) { child.parentElement = this; } });
  return {
    ...api, live, findRequests, terminal, makeTerminal, observers, container, errors,
    fits: () => fits, disposed: () => disposed, removes: () => removes,
    appearancesDisconnected: () => appearancesDisconnected,
    failOpen: (fail) => { failOpen = fail; },
  };
}

test("queued resize callbacks lose ownership on replacement and detach", () => {
  const f = fixture();
  f.attachTab("term", f.container());
  const detach = f.attachTab("term", f.container());
  assert.equal(f.removes(), 0, "replacement moves the host without an explicit removal");
  assert.equal(f.fits(), 2);
  f.observers[0].callback();
  assert.equal(f.fits(), 2, "a queued callback from the old observer cannot refit the new mount");
  f.observers[1].callback();
  assert.equal(f.fits(), 3, "the current observer can still refit");
  detach();
  f.observers[1].callback();
  assert.equal(f.fits(), 3, "queued callbacks cannot refit a detached host");
  const removes = f.removes();
  detach();
  assert.equal(f.removes(), removes, "active detach is idempotent");
});

test("dispose releases the active attachment as well as terminal state", () => {
  const f = fixture();
  const detach = f.attachTab("term", f.container());
  f.dispose("term");
  assert.equal(f.observers[0].disconnected, true);
  assert.equal(f.terminal.host.parentElement, null);
  assert.equal(f.appearancesDisconnected(), 1);
  assert.equal(f.disposed(), 1);
  assert.equal(f.live.has("term"), false);
  assert.equal(f.findRequests.has("term"), false);
  detach();
  f.observers[0].callback();
  assert.equal(f.removes(), 1);
  assert.equal(f.fits(), 1);
  f.dispose("term");
  assert.equal(f.disposed(), 1);
});

test("a disposed session's detach cannot remove a new session with the same id", () => {
  const f = fixture();
  const detachOld = f.attachTab("term", f.container());
  f.dispose("term");
  const replacement = f.makeTerminal();
  f.live.set("term", replacement);
  const container = f.container();
  f.attachTab("term", container);
  detachOld();
  assert.equal(replacement.host.parentElement, container);
  assert.equal(f.observers[1].disconnected, false);
});

test("failed open reports once, leaves no observer, and permits a retry", () => {
  const f = fixture();
  f.failOpen(true);
  const detachFailed = f.attachTab("term", f.container());
  assert.equal(f.terminal.host.parentElement, null);
  assert.equal(f.observers.length, 0);
  assert.equal(f.errors.length, 1);
  f.failOpen(false);
  const container = f.container();
  f.attachTab("term", container);
  detachFailed();
  assert.equal(f.terminal.host.parentElement, container);
  assert.equal(f.observers[0].disconnected, false);
});

test("attaching an unknown terminal is a no-op", () => {
  const f = fixture();
  f.attachTab("missing", f.container())();
  assert.equal(f.observers.length, 0);
  assert.equal(f.removes(), 0);
});
