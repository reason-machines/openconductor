import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";
import type { PersistArgs } from "./restore";
import type { KeyEventLike } from "../../keybindings/shortcut";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;
type Key = KeyEventLike & { type: string; preventDefault(): void; stopPropagation(): void };

function fixture(failSpawn = false) {
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const writes: { id: string; data: string }[] = [];
  const mirrors: { id: string; data: string }[] = [];
  const clearedHistory: string[] = [];
  const history: PersistArgs[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen {
    cols = 80;
    rows = 24;
    clears = 0;
    options: Record<string, unknown>;
    input: (data: string) => void = noop;
    key: (event: Key) => boolean = () => true;
    constructor(options: Record<string, unknown>) { this.options = { disableStdin: false, ...options }; screens.push(this); }
    loadAddon() {}
    attachCustomKeyEventHandler(handler: (event: Key) => boolean) { this.key = handler; }
    onData(handler: (data: string) => void) { this.input = handler; }
    onResize() {}
    write(_data: string, done?: () => void) { done?.(); }
    clear() { this.clears++; }
    dispose() {}
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async ({ id }: { id: string }) => { if (failSpawn) throw new Error("spawn failed"); return id; },
      ptyWrite: async (id: string, data: string) => { writes.push({ id, data }); },
      ptyClearHistory: async (id: string) => { clearedHistory.push(id); },
      ptyWriteMirror: async (id: string, data: string) => { mirrors.push({ id, data }); },
      ptyPersistTerminalHistory: async (record: PersistArgs) => { history.push(record); },
      ptyKill: async () => {}, ptyResize: async () => {}, ptyAckBytes: async () => {},
      ptyDeleteTerminalHistory: async () => {},
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
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout, crypto: { randomUUID: () => `clear-fixture-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.clearTab && session.closeTab);
  const { openTab, getTabs, clearTab, closeTab } = session;
  return {
    openTab, getTabs, clearTab, closeTab, screens, writes, mirrors, clearedHistory, history,
    emit: (e: PtyEvent) => { assert.ok(event); event(e); },
    settle: () => new Promise<void>((resolve) => setImmediate(resolve)),
  };
}

function clearShortcut(screen: { key(event: Key): boolean }) {
  return screen.key({ type: "keydown", key: "k", code: "KeyK", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, preventDefault() {}, stopPropagation() {} });
}

for (const state of ["starting", "running", "exited", "spawn_error", "disabled"] as const) {
  test(`${state} clear preserves screen/history clearing and guards the redraw request`, async () => {
    const f = fixture(state === "spawn_error");
    if (state === "spawn_error") await assert.rejects(f.openTab("ws", "/workspace"), /spawn failed/);
    else await f.openTab("ws", "/workspace");
    const id = f.getTabs("ws").tabs[0].id;
    if (state === "running" || state === "exited" || state === "disabled") f.emit({ kind: "ready", id, pid: 12 });
    if (state === "exited") f.emit({ kind: "exit", id, exitCode: 0, signal: null });
    if (state === "disabled") f.screens[0].options.disableStdin = true;
    f.clearTab(id);
    await f.settle();
    assert.equal(f.screens[0].clears, 1);
    assert.deepEqual(f.clearedHistory, [id]);
    assert.deepEqual(f.mirrors, [{ id, data: "\x1b[H\x1b[2J\x1b[3J" }]);
    const saved = f.history.find((record) => record.id === id);
    assert.ok(saved);
    assert.equal(saved.hasReceivedUserInput, false);
    assert.deepEqual(f.writes, state === "running" ? [{ id, data: "\x0c" }] : []);
    f.closeTab("ws", id);
  });
}

for (const priorInput of [false, true]) {
  test(`clear shortcut targets only its terminal and preserves user-input metadata (${priorInput})`, async () => {
    const f = fixture();
    const first = await f.openTab("ws", "/workspace");
    const second = await f.openTab("ws", "/workspace");
    f.emit({ kind: "ready", id: first, pid: 12 });
    f.emit({ kind: "ready", id: second, pid: 13 });
    if (priorInput) f.screens[1].input("previous input");
    f.writes.length = 0;
    assert.equal(clearShortcut(f.screens[1]), false);
    await f.settle();
    assert.equal(f.screens[0].clears, 0);
    assert.equal(f.screens[1].clears, 1);
    assert.deepEqual(f.clearedHistory, [second]);
    assert.deepEqual(f.mirrors, [{ id: second, data: "\x1b[H\x1b[2J\x1b[3J" }]);
    const saved = f.history.find((record) => record.id === second);
    assert.ok(saved);
    assert.equal(saved.hasReceivedUserInput, priorInput);
    assert.deepEqual(f.writes, [{ id: second, data: "\x0c" }]);
    f.closeTab("ws", first);
    f.closeTab("ws", second);
  });
}

test("clearing a closed terminal cannot write to a surviving terminal", async () => {
  const f = fixture();
  const first = await f.openTab("ws", "/workspace");
  const second = await f.openTab("ws", "/workspace");
  f.emit({ kind: "ready", id: first, pid: 12 });
  f.emit({ kind: "ready", id: second, pid: 13 });
  f.closeTab("ws", first);
  f.clearTab(first);
  await f.settle();
  assert.deepEqual(f.writes, []);
  assert.equal(f.screens[1].clears, 0);
  f.closeTab("ws", second);
});
