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
  let pagehide = () => {};
  let rejectSpawn = failSpawn;
  const writes: { id: string; data: string }[] = [];
  const history: PersistArgs[] = [];
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen {
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    input: (data: string) => void = noop;
    key: (event: Key) => boolean = () => true;
    constructor(options: Record<string, unknown>) { this.options = { disableStdin: false, ...options }; screens.push(this); }
    loadAddon() {}
    attachCustomKeyEventHandler(handler: (event: Key) => boolean) { this.key = handler; }
    onData(handler: (data: string) => void) { this.input = handler; }
    onResize() {}
    write(_data: string, done?: () => void) { done?.(); }
    clear() {}
    dispose() {}
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async ({ id }: { id: string }) => { if (rejectSpawn) throw new Error("spawn failed"); return id; },
      ptyWrite: async (id: string, data: string) => { writes.push({ id, data }); },
      ptyPersistTerminalHistory: async (record: PersistArgs) => { history.push(record); },
      ptyWriteMirror: async () => {}, ptyClearHistory: async () => {},
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
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout, crypto: { randomUUID: () => "input-fixture" },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: (type: string, callback: () => void) => { if (type === "pagehide") pagehide = callback; } },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.getTabs && session.retryTab && session.closeTab && session.getFindRequests);
  const { openTab, getTabs, retryTab, closeTab, getFindRequests } = session;
  return {
    openTab, getTabs, retryTab, closeTab, getFindRequests, screens, writes,
    allowSpawn: () => { rejectSpawn = false; },
    emit: (e: PtyEvent) => { assert.ok(event); event(e); },
    flushHistory: async () => { pagehide(); await new Promise<void>((resolve) => setImmediate(resolve)); return history[history.length - 1]; },
  };
}

function shortcut(screen: { key(event: Key): boolean }, key = "ArrowLeft") {
  return screen.key({ type: "keydown", key, code: "", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, preventDefault() {}, stopPropagation() {} });
}

for (const state of ["starting", "exited", "spawn_error"] as const) {
  for (const input of ["ordinary", "line-edit"] as const) {
    test(`${state} ${input} input cannot queue writes or mark saved user input`, async () => {
      const f = fixture(state === "spawn_error");
      if (state === "spawn_error") await assert.rejects(f.openTab("ws", "/workspace"), /spawn failed/);
      else await f.openTab("ws", "/workspace");
      const id = f.getTabs("ws").tabs[0].id;
      if (state === "exited") {
        f.emit({ kind: "ready", id, pid: 12 });
        f.emit({ kind: "exit", id, exitCode: 0, signal: null });
      }
      assert.equal(f.getTabs("ws").tabs[0].status, state);
      if (input === "ordinary") f.screens[0].input("ignored");
      else assert.equal(shortcut(f.screens[0]), false);
      const saved = await f.flushHistory();
      assert.ok(saved);
      assert.equal(saved.hasReceivedUserInput, false);
      assert.deepEqual(f.writes, []);
      f.closeTab("ws", id);
    });
  }
}

for (const input of ["ordinary", "line-edit"] as const) {
  test(`running enabled ${input} input is written to the selected PTY and recorded`, async () => {
    const f = fixture();
    const id = await f.openTab("ws", "/workspace");
    f.emit({ kind: "ready", id, pid: 12 });
    if (input === "ordinary") f.screens[0].input("echo hello\r");
    else assert.equal(shortcut(f.screens[0]), false);
    assert.deepEqual(f.writes, [{ id, data: input === "ordinary" ? "echo hello\r" : "\x01" }]);
    const saved = await f.flushHistory();
    assert.ok(saved);
    assert.equal(saved.hasReceivedUserInput, true);
    f.closeTab("ws", id);
  });

  test(`running disabled ${input} input cannot queue writes or mark saved user input`, async () => {
    const f = fixture();
    const id = await f.openTab("ws", "/workspace");
    f.emit({ kind: "ready", id, pid: 12 });
    f.screens[0].options.disableStdin = true;
    if (input === "ordinary") f.screens[0].input("ignored");
    else shortcut(f.screens[0]);
    const saved = await f.flushHistory();
    assert.ok(saved);
    assert.equal(saved.hasReceivedUserInput, false);
    assert.deepEqual(f.writes, []);
    f.closeTab("ws", id);
  });
}

test("stdin is disabled until ready and after exit", async () => {
  const f = fixture();
  const id = await f.openTab("ws", "/workspace");
  assert.equal(f.screens[0].options.disableStdin, true);
  f.emit({ kind: "ready", id, pid: 12 });
  assert.equal(f.screens[0].options.disableStdin, false);
  f.emit({ kind: "exit", id, exitCode: 0, signal: null });
  assert.equal(f.screens[0].options.disableStdin, true);
  f.closeTab("ws", id);
});

test("failed-spawn retry stays read-only until ready, then accepts input", async () => {
  const f = fixture(true);
  await assert.rejects(f.openTab("ws", "/workspace"), /spawn failed/);
  const id = f.getTabs("ws").tabs[0].id;
  assert.equal(f.screens[0].options.disableStdin, true);
  f.allowSpawn();
  await f.retryTab(id);
  assert.equal(f.getTabs("ws").tabs[0].status, "starting");
  assert.equal(f.screens[0].options.disableStdin, true);
  f.screens[0].input("ignored");
  shortcut(f.screens[0]);
  assert.deepEqual(f.writes, []);
  const saved = await f.flushHistory();
  assert.ok(saved);
  assert.equal(saved.hasReceivedUserInput, false);
  f.emit({ kind: "ready", id, pid: 12 });
  assert.equal(f.screens[0].options.disableStdin, false);
  f.screens[0].input("accepted");
  assert.deepEqual(f.writes, [{ id, data: "accepted" }]);
  f.closeTab("ws", id);
});

test("read-only terminals still allow local Find and clear commands", async () => {
  const f = fixture();
  const id = await f.openTab("ws", "/workspace");
  assert.equal(shortcut(f.screens[0], "f"), false);
  assert.equal(f.getFindRequests(id), 1);
  assert.equal(shortcut(f.screens[0], "k"), false);
  assert.deepEqual(f.writes, []);
  f.closeTab("ws", id);
});
