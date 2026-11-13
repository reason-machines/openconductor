import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ITerminalOptions } from "@xterm/xterm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";
import type { HistoryRecord } from "./restore";

const deps = createRequire(resolve("package.json"));
const ts: typeof import("typescript") = deps("typescript");
const { Terminal: RealTerminal }: typeof import("@xterm/xterm") = deps("@xterm/xterm");
const compiled = new Map<string, string>();
type Exports = Record<string, unknown> & Partial<typeof Session>;

function fixture({ cols = 12, restore }: { cols?: number; restore?: HistoryRecord } = {}) {
  let event: ((event: PtyEvent) => void) | undefined;
  let nextId = 0;
  const screens: Screen[] = [];
  const noop = () => {};
  class Screen extends RealTerminal {
    disposed = false;
    constructor(options: ITerminalOptions) {
      super({ ...options, cols, rows: 5 });
      screens.push(this);
    }
    open() {}
    focus() {}
    dispose() { this.disposed = true; super.dispose(); }
  }
  const saved = restore ? JSON.stringify({ version: 2, state: {
    terminals: [{ id: restore.sessionId, localWorkspaceId: "ws", cwd: "/workspace" }],
    workspaceTerminals: [["ws", [restore.sessionId]]],
    activeTabPerWorkspace: [["ws", restore.sessionId]],
  } }) : null;
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { activate() {} dispose() {} fit() {} } },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async () => {}, ptyWrite: async () => {}, ptyResize: async () => {},
      ptyKill: async () => {}, ptyAckBytes: async () => {}, ptyClearHistory: async () => {},
      ptyWriteMirror: async () => {}, ptyPersistTerminalHistory: async () => {},
      ptyLoadTerminalHistory: async () => restore,
      ptyDeleteTerminalHistory: async () => {}, ptyDeleteWorkspaceTerminalHistory: async () => {},
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({ getItem: async () => saved, setItem: async () => {} }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: true }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 2000, onScrollbackRows: noop },
  };
  const modules = new Map<string, { exports: Exports }>();
  function load(name: string): Exports {
    name = name.replace(/\.tsx?$/, "");
    const cached = modules.get(name);
    if (cached) return cached.exports;
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
      console, TextDecoder, TextEncoder, setTimeout, clearTimeout,
      crypto: { randomUUID: () => `unicode-fixture-${++nextId}` },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
      window: { addEventListener: noop },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  assert.ok(session.openTab && session.openBigTab && session.getTabs && session.terminalOf && session.closeTab && session.restoreWorkspaceTabs);
  const { openTab, openBigTab, getTabs, terminalOf, closeTab, restoreWorkspaceTabs } = session;
  return {
    openTab, openBigTab, terminalOf, restoreWorkspaceTabs, screens,
    write: async (id: string, data: string | Uint8Array) => {
      assert.ok(event);
      event({ kind: "data", id, data: typeof data === "string" ? new TextEncoder().encode(data) : data });
      const terminal = terminalOf(id);
      assert.ok(terminal);
      await new Promise<void>((done) => terminal.write("", done));
      return terminal;
    },
    flush: async (id: string) => {
      const terminal = terminalOf(id);
      assert.ok(terminal);
      await new Promise<void>((done) => terminal.write("", done));
      return terminal;
    },
    closeTab: (id: string) => closeTab("ws", id),
    close: () => { for (const tab of getTabs("ws").tabs) closeTab("ws", tab.id); },
  };
}

test("ordinary panel LF starts the next line at column zero", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "left\nright");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "right");
  assert.equal(terminal.buffer.active.cursorX, 5);
});

test("center terminal LF resets the column after wide output", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openBigTab("ws", "/workspace", { command: undefined });
  const terminal = await f.write(id, "\u754c\nok");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "ok");
  assert.equal(terminal.buffer.active.cursorX, 2);
});

test("LF received in a separate PTY event resets the output column", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  await f.write(id, "abc");
  await f.write(id, "\n");
  const terminal = await f.write(id, "z");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "z");
  assert.equal(terminal.buffer.active.cursorX, 1);
});

test("consecutive LF keep the following output aligned to column zero", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "ab\n\nc");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "");
  assert.equal(terminal.buffer.active.getLine(2)?.translateToString(true), "c");
});

test("LF near the right margin starts the following row at column zero", async (t) => {
  const f = fixture({ cols: 6 }); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "abcd\nZ");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "Z");
  assert.equal(terminal.buffer.active.cursorX, 1);
});

test("SGR around LF does not leave indentation on the next output line", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "abc\x1b[31m\nD\x1b[0m");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "D");
  assert.equal(terminal.buffer.active.cursorX, 1);
});

test("ordinary terminal CRLF retains its existing output alignment", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "left\r\nright");
  assert.equal(terminal.buffer.active.getLine(1)?.translateToString(true), "right");
  assert.equal(terminal.buffer.active.cursorX, 5);
});

test("ordinary terminal CR still overwrites the current row", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "alpha\rB");
  assert.equal(terminal.buffer.active.getLine(0)?.translateToString(true), "Blpha");
  assert.equal(terminal.buffer.active.cursorX, 1);
});

test("ordinary terminal plain output keeps its original width", async (t) => {
  const f = fixture(); t.after(f.close);
  const id = await f.openTab("ws", "/workspace");
  const terminal = await f.write(id, "plain");
  assert.equal(terminal.buffer.active.getLine(0)?.translateToString(true), "plain");
  assert.equal(terminal.buffer.active.cursorX, 5);
});

test("disposing one ordinary terminal preserves sibling output", async (t) => {
  const f = fixture(); t.after(f.close);
  const first = await f.openTab("ws", "/workspace");
  const second = await f.openTab("ws", "/workspace");
  await f.write(second, "kept");
  f.closeTab(first);
  const terminal = await f.write(second, "!");
  assert.equal(terminal.buffer.active.getLine(0)?.translateToString(true), "kept!");
  assert.equal(f.screens[0].disposed, true);
  assert.equal(f.screens[1].disposed, false);
});
