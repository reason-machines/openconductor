import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";
import type { SpawnArgs } from "./pty";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;

function fixture() {
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const registered = new Set<string>();
  const resizes: { id: string; cols: number; rows: number; registered: boolean }[] = [];
  const spawns: { args: SpawnArgs; resolve: (id: string) => void; reject: (error: Error) => void }[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen {
    unicode = { activeVersion: "6" };
    cols = 80;
    rows = 24;
    options: ITerminalOptions;
    resizeHandler: (size: { cols: number; rows: number }) => void = noop;
    constructor(options: ITerminalOptions) { this.options = options; screens.push(this); }
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {}
    onResize(callback: (size: { cols: number; rows: number }) => void) { this.resizeHandler = callback; }
    resize(cols: number, rows: number) {
      this.cols = cols;
      this.rows = rows;
      this.resizeHandler({ cols, rows });
    }
    write(_data: string, done?: () => void) { done?.(); }
    clear() {}
    dispose() {}
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: (args: SpawnArgs) => new Promise<string>((resolve, reject) => { spawns.push({ args, resolve, reject }); }),
      ptyResize: async (id: string, cols: number, rows: number) => {
        resizes.push({ id, cols, rows, registered: registered.has(id) });
        if (!registered.has(id)) throw new Error("terminal is not registered yet");
      },
      ptyKill: async (id: string) => { registered.delete(id); },
      ptyWrite: async () => {}, ptyAckBytes: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => null, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: false }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: noop },
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(name: string): Exports {
    name = name.replace(/\.tsx?$/, "");
    const existing = modules.get(name);
    if (existing) return existing.exports;
    const file = name + ".ts";
    let output = compiled.get(file);
    if (output === undefined) {
      output = ts.transpileModule(readFileSync(file, "utf8"), {
        fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
      }).outputText;
      compiled.set(file, output);
    }
    const module: { exports: Exports } = { exports: {} };
    modules.set(name, module);
    const require = (dep: string): unknown => {
      if (dep === "react") return deps(dep);
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout, crypto: { randomUUID: () => `resize-fixture-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.retryTab && session.closeTab);
  const { openTab, getTabs, retryTab, closeTab } = session;
  const emit = (e: PtyEvent) => { assert.ok(event); event(e); };
  const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
  return {
    openTab, getTabs, retryTab, closeTab, screens, spawns, resizes, emit, tick,
    complete: (index: number, ready = true) => {
      const spawn = spawns[index];
      assert.ok(spawn.args.id);
      registered.add(spawn.args.id);
      if (ready) emit({ kind: "ready", id: spawn.args.id, pid: 12 });
      spawn.resolve(spawn.args.id);
    },
    accepted: () => resizes.filter((request) => request.registered).map(({ id, cols, rows }) => ({ id, cols, rows })),
  };
}

for (const [cols, rows] of [[120, 24], [80, 40], [120, 40]]) {
  test(`startup resize is reconciled after registration (${cols} columns, ${rows} rows)`, async () => {
    const f = fixture();
    const opened = f.openTab("ws", "/workspace");
    await f.tick();
    assert.equal(f.spawns.length, 1);
    assert.equal(f.spawns[0].args.cols, 80);
    assert.equal(f.spawns[0].args.rows, 24);
    f.screens[0].resize(cols, rows);
    assert.equal(f.resizes[0].registered, false);
    f.complete(0);
    const id = await opened;
    assert.deepEqual(f.accepted(), [{ id, cols, rows }]);
    f.closeTab("ws", id);
  });
}

test("unchanged startup dimensions do not submit a redundant resize", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  f.complete(0);
  const id = await opened;
  assert.deepEqual(f.resizes, []);
  f.closeTab("ws", id);
});

test("startup reconciliation uses the latest dimensions after several changes", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  f.screens[0].resize(90, 30);
  f.screens[0].resize(132, 44);
  f.complete(0);
  const id = await opened;
  assert.deepEqual(f.accepted(), [{ id, cols: 132, rows: 44 }]);
  f.closeTab("ws", id);
});

test("successful spawn reconciles even when the ready event has not yet been consumed", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  f.screens[0].resize(100, 36);
  f.complete(0, false);
  const id = await opened;
  assert.equal(f.getTabs("ws").tabs[0].status, "starting");
  assert.deepEqual(f.accepted(), [{ id, cols: 100, rows: 36 }]);
  f.emit({ kind: "ready", id, pid: 12 });
  assert.equal(f.accepted().length, 1);
  f.closeTab("ws", id);
});

test("a terminal closed during startup cannot send a late reconciliation", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const id = f.getTabs("ws").tabs[0].id;
  f.screens[0].resize(100, 36);
  f.closeTab("ws", id);
  f.complete(0);
  await opened;
  assert.deepEqual(f.accepted(), []);
});

test("an exit observed before spawn resolution prevents a late reconciliation", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const id = f.getTabs("ws").tabs[0].id;
  f.screens[0].resize(100, 36);
  f.complete(0);
  f.emit({ kind: "exit", id, exitCode: 0, signal: null });
  await opened;
  assert.deepEqual(f.accepted(), []);
  f.closeTab("ws", id);
});

test("a rejected spawn does not reconcile; retry captures its own dimensions", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const id = f.getTabs("ws").tabs[0].id;
  f.screens[0].resize(100, 36);
  const rejected = assert.rejects(opened, /spawn failed/);
  f.spawns[0].reject(new Error("spawn failed"));
  await rejected;
  assert.deepEqual(f.accepted(), []);
  const retried = f.retryTab(id);
  await f.tick();
  assert.equal(f.spawns[1].args.cols, 100);
  assert.equal(f.spawns[1].args.rows, 36);
  f.screens[0].resize(110, 42);
  f.complete(1);
  await retried;
  assert.deepEqual(f.accepted(), [{ id, cols: 110, rows: 42 }]);
  f.closeTab("ws", id);
});

test("post-startup resize still forwards normally and does not change its sibling", async () => {
  const f = fixture();
  const first = f.openTab("ws", "/workspace");
  await f.tick();
  const second = f.openTab("ws", "/workspace");
  await f.tick();
  f.screens[0].resize(100, 36);
  f.complete(0);
  f.complete(1);
  const id = await first;
  const sibling = await second;
  f.screens[0].resize(140, 50);
  assert.deepEqual(f.accepted(), [{ id, cols: 100, rows: 36 }, { id, cols: 140, rows: 50 }]);
  assert.equal(f.screens[1].cols, 80);
  assert.equal(f.screens[1].rows, 24);
  f.closeTab("ws", id);
  f.closeTab("ws", sibling);
});
