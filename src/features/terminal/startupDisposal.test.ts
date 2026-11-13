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
  const kills: { id: string; registered: boolean }[] = [];
  const spawns: { args: SpawnArgs; resolve: (id: string) => void; reject: (error: Error) => void }[] = [];
  const noop = () => {};
  class Screen {
    cols = 80;
    rows = 24;
    options: ITerminalOptions;
    constructor(options: ITerminalOptions) { this.options = options; }
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData() {}
    onResize() {}
    write(_data: string, done?: () => void) { done?.(); }
    unicode = { activeVersion: "11" };
    dispose() {}
  }
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: (args: SpawnArgs) => new Promise<string>((resolve, reject) => { spawns.push({ args, resolve, reject }); }),
      ptyKill: async (id: string) => {
        const found = registered.delete(id);
        kills.push({ id, registered: found });
        if (!found) throw new Error("terminal is not registered yet");
      },
      ptyResize: async () => {}, ptyWrite: async () => {}, ptyAckBytes: async () => {},
      ptyPersistTerminalHistory: async () => {}, ptyDeleteTerminalHistory: async () => {},
      ptyDeleteWorkspaceTerminalHistory: async () => {}, ptyLoadTerminalHistory: async () => undefined,
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
      if (dep === "react" || dep === "@xterm/addon-unicode11") return deps(dep);
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${output}\n})`, {
      console, Error, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      crypto: { randomUUID: () => `disposal-fixture-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.openBigTab && session.getTabs && session.retryTab && session.closeTab && session.destroyWorkspaceTerminals);
  const { openTab, openBigTab, getTabs, retryTab, closeTab, destroyWorkspaceTerminals } = session;
  const emit = (e: PtyEvent) => { assert.ok(event); event(e); };
  const idOf = (index: number) => { const id = spawns[index].args.id; assert.ok(id); return id; };
  const register = (index: number) => {
    const id = idOf(index);
    registered.add(id);
    emit({ kind: "ready", id, pid: 12 });
    return id;
  };
  return {
    openTab, openBigTab, getTabs, retryTab, closeTab, destroyWorkspaceTerminals, spawns, registered, kills, idOf, register,
    tick: () => new Promise<void>((resolve) => setImmediate(resolve)),
    complete: (index: number) => { const id = register(index); spawns[index].resolve(id); },
  };
}

for (const action of ["close panel", "close center", "destroy workspace"]) {
  test(`${action} during startup cleans up the late-created backend session`, async () => {
    const f = fixture();
    const opened = action === "close center"
      ? f.openBigTab("ws", "/workspace", { command: undefined })
      : f.openTab("ws", "/workspace");
    await f.tick();
    assert.equal(f.spawns.length, 1);
    const id = f.idOf(0);
    if (action === "destroy workspace") await f.destroyWorkspaceTerminals("ws");
    else f.closeTab("ws", id);
    assert.equal(f.getTabs("ws").tabs.length, 0);
    assert.deepEqual(f.kills, [{ id, registered: false }]);
    f.complete(0);
    assert.equal(await opened, id);
    assert.equal(f.registered.has(id), false, "a closed terminal must not retain its late backend session");
  });
}

test("closing a failed terminal during its retry cleans up the late-created backend session", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const rejected = assert.rejects(opened, /initial spawn failed/);
  f.spawns[0].reject(new Error("initial spawn failed"));
  await rejected;
  const id = f.idOf(0);
  assert.equal(f.getTabs("ws").tabs[0].status, "spawn_error");
  const retry = f.retryTab(id);
  await f.tick();
  assert.equal(f.idOf(1), id);
  f.closeTab("ws", id);
  f.complete(1);
  await retry;
  assert.equal(f.registered.has(id), false, "a closed retry must not retain its late backend session");
});

test("late cleanup of a closed terminal preserves its running sibling", async () => {
  const f = fixture();
  const first = f.openTab("ws", "/workspace");
  await f.tick();
  const second = f.openTab("ws", "/workspace");
  await f.tick();
  const closedId = f.idOf(0);
  f.complete(1);
  const siblingId = await second;
  f.closeTab("ws", closedId);
  f.complete(0);
  await first;
  assert.equal(f.registered.has(closedId), false, "only the late closed terminal is removed");
  assert.equal(f.registered.has(siblingId), true);
  assert.deepEqual(Array.from(f.getTabs("ws").tabs, (tab) => tab.id), [siblingId]);
  f.closeTab("ws", siblingId);
});

test("an open terminal retains its backend session after successful startup", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  f.complete(0);
  const id = await opened;
  assert.equal(f.registered.has(id), true);
  assert.equal(f.getTabs("ws").tabs[0].status, "running");
  assert.deepEqual(f.kills, []);
  f.closeTab("ws", id);
  assert.equal(f.registered.has(id), false);
});

test("closing after backend registration but before spawn resolution stays closed", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const id = f.register(0);
  f.closeTab("ws", id);
  assert.equal(f.registered.has(id), false);
  f.spawns[0].resolve(id);
  await opened;
  assert.equal(f.registered.has(id), false);
  assert.equal(f.getTabs("ws").tabs.length, 0);
});

test("spawn rejection after close does not recreate the tab or attempt late cleanup", async () => {
  const f = fixture();
  const opened = f.openTab("ws", "/workspace");
  await f.tick();
  const id = f.idOf(0);
  const rejected = assert.rejects(opened, /spawn failed after close/);
  f.closeTab("ws", id);
  f.spawns[0].reject(new Error("spawn failed after close"));
  await rejected;
  assert.equal(f.registered.size, 0);
  assert.equal(f.getTabs("ws").tabs.length, 0);
  assert.deepEqual(f.kills, [{ id, registered: false }]);
});
