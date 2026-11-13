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
type Options = { listener?: boolean; storage?: boolean; history?: boolean; saved?: boolean };

function gate() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

function fixture(options: Options = {}) {
  const listener = gate();
  const storage = gate();
  const history = gate();
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const spawns: SpawnArgs[] = [];
  const noop = () => {};
  const saved = JSON.stringify({ version: 2, state: {
    terminals: [{ id: "saved-terminal", localWorkspaceId: "ws", startingCommandRan: false, title: "Terminal 1", cwd: "/workspace" }],
    workspaceTerminals: [["ws", ["saved-terminal"]]],
    activeTabPerWorkspace: [["ws", "saved-terminal"]],
    lastTabKind: "terminal",
  } });
  class Screen {
    cols = 80;
    rows = 24;
    options: ITerminalOptions;
    constructor(value: ITerminalOptions) { this.options = value; }
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {}
    onResize() {}
    resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; }
    write(_data: string, done?: () => void) { done?.(); }
    dispose() {}
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => {
        event = callback;
        if (options.listener) await listener.promise;
        return noop;
      },
      ptySpawn: async (args: SpawnArgs) => {
        spawns.push(args);
        assert.ok(args.id && event);
        event({ kind: "ready", id: args.id, pid: 12 });
        return args.id;
      },
      ptyKill: async () => {}, ptyResize: async () => {}, ptyWrite: async () => {}, ptyAckBytes: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {},
      ptyDeleteWorkspaceTerminalHistory: async () => {},
      ptyLoadTerminalHistory: async () => { if (options.history) await history.promise; return undefined; },
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({
      getItem: async () => { if (options.storage) await storage.promise; return options.saved ? saved : null; },
      setItem: async () => {},
    }) },
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
      if (dep === "react" || dep === "@xterm/addon-unicode11") return deps(dep);
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, Error, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      crypto: { randomUUID: () => `cancel-fixture-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.openBigTab && session.restoreWorkspaceTabs && session.getTabs && session.destroyWorkspaceTerminals);
  const { openTab, openBigTab, restoreWorkspaceTabs, getTabs, destroyWorkspaceTerminals } = session;
  return {
    openTab, openBigTab, restoreWorkspaceTabs, getTabs, destroyWorkspaceTerminals, spawns, listener, storage, history,
    tick: () => new Promise<void>((resolve) => setImmediate(resolve)),
  };
}

const settled = <T>(promise: Promise<T>): Promise<T | undefined> => promise.catch(() => undefined);

test("workspace removal while the event listener is pending does not create a terminal", async () => {
  const f = fixture({ listener: true });
  const opening = settled(f.openTab("ws", "/workspace"));
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.listener.release();
  await opening;
  assert.equal(f.getTabs("ws").tabs.length, 0, "the removed workspace must remain empty");
  assert.equal(f.spawns.length, 0);
});

test("workspace removal cancels every panel start sharing the pending listener", async () => {
  const f = fixture({ listener: true });
  const openings = [settled(f.openTab("ws", "/workspace")), settled(f.openTab("ws", "/workspace"))];
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.listener.release();
  await Promise.all(openings);
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.equal(f.spawns.length, 0);
});

test("cancelling a start does not cancel a sibling workspace using the same listener", async () => {
  const f = fixture({ listener: true });
  const cancelled = settled(f.openTab("ws", "/workspace"));
  const sibling = f.openTab("other", "/other");
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.listener.release();
  await cancelled;
  const id = await sibling;
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.equal(f.getTabs("other").tabs[0].id, id);
  assert.equal(f.spawns.length, 1);
  assert.equal(f.spawns[0].cwd, "/other");
});

test("workspace removal while saved history loads does not recreate its restored tab", async () => {
  const f = fixture({ saved: true, history: true });
  const restoring = settled(f.restoreWorkspaceTabs("ws", "/workspace"));
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.history.release();
  await restoring;
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.equal(f.spawns.length, 0);
});

test("workspace removal while a center terminal awaits the listener leaves it closed", async () => {
  const f = fixture({ listener: true });
  const opening = settled(f.openBigTab("ws", "/workspace", { command: undefined }));
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.listener.release();
  await opening;
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.equal(f.spawns.length, 0);
});

test("a pending center-terminal request cannot reopen a removed workspace", async () => {
  const f = fixture({ storage: true });
  const opening = settled(f.openBigTab("ws", "/workspace", { command: undefined }));
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  f.storage.release();
  await opening;
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.equal(f.spawns.length, 0);
});

test("an explicit new start after teardown survives while the old pending start stays cancelled", async () => {
  const f = fixture({ listener: true });
  const old = settled(f.openTab("ws", "/old"));
  await f.tick();
  await f.destroyWorkspaceTerminals("ws");
  const fresh = f.openTab("ws", "/new");
  f.listener.release();
  await old;
  const id = await fresh;
  assert.equal(f.getTabs("ws").tabs.length, 1);
  assert.equal(f.getTabs("ws").tabs[0].id, id);
  assert.equal(f.spawns.length, 1);
  assert.equal(f.spawns[0].cwd, "/new");
});

test("an ordinary panel start still reaches its backend and running tab", async () => {
  const f = fixture();
  const id = await f.openTab("ws", "/workspace");
  assert.equal(f.spawns.length, 1);
  assert.equal(f.getTabs("ws").tabs[0].id, id);
  assert.equal(f.getTabs("ws").tabs[0].status, "running");
});

test("an ordinary center start still reaches its center tab", async () => {
  const f = fixture();
  const id = await f.openBigTab("ws", "/workspace", { command: undefined });
  assert.equal(f.spawns.length, 1);
  assert.equal(f.getTabs("ws").tabs[0].id, id);
  assert.equal(f.getTabs("ws").tabs[0].placement, "center");
});

test("an uncancelled saved terminal still restores normally", async () => {
  const f = fixture({ saved: true });
  assert.equal(await f.restoreWorkspaceTabs("ws", "/workspace"), true);
  assert.equal(f.spawns.length, 1);
  assert.equal(f.getTabs("ws").tabs[0].id, "saved-terminal");
  assert.equal(f.getTabs("ws").tabs[0].status, "running");
});
