import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type * as Session from "./session";
import type { PtyEvent } from "./events";
import type { SpawnArgs } from "./pty";
import type { TerminalHost } from "./TerminalPanel";
import { emptyTabs, tabsReducer } from "./tabs.ts";

const deps = createRequire(resolve("package.json"));
const React: typeof import("react") = deps("react");
interface RenderNode {
  children: unknown[];
  props: { disabled?: boolean; onClick?: () => void; [key: string]: unknown };
  findByType(type: string): RenderNode;
  findAllByType(type: string): RenderNode[];
  findByProps(props: Record<string, unknown>): RenderNode;
  findAll(predicate: (node: RenderNode) => boolean): RenderNode[];
}
interface Mounted {
  root: RenderNode;
  toJSON(): unknown;
  unmount(): void;
}
const renderer: {
  create(element: React.ReactElement): Mounted;
  act(callback: () => void | Promise<void>): void | Promise<void>;
} = deps("react-test-renderer");
const ts: typeof import("typescript") = deps("typescript");
type ModuleExports = Record<string, unknown> & Partial<typeof Session> & { TerminalHost?: typeof TerminalHost };

function fixture(spawn: (args: SpawnArgs) => Promise<string>, saved = false) {
  let event: ((event: PtyEvent) => void) | undefined;
  const calls: SpawnArgs[] = [];
  const deleted: string[] = [];
  const writes: string[] = [];
  const screens: Screen[] = [];
  class Screen {
    unicode = { activeVersion: "6" };
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    disposed = false;
    input: (text: string) => void = () => {};
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    attachCustomKeyEventHandler() {}
    onData(input: (text: string) => void) { this.input = input; }
    onResize() {}
    onSelectionChange() { return { dispose() {} }; }
    getSelection() { return ""; }
    write() {}
    resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; }
    dispose() { this.disposed = true; }
  }
  const storage = new Map<string, string>();
  if (saved) storage.set("terminal-panel-tabs-v1", JSON.stringify({ version: 2, state: {
    terminals: [{ id: "saved-terminal", localWorkspaceId: "ws", startingCommandRan: true, title: "Kept" }],
    workspaceTerminals: [["ws", ["saved-terminal"]]], activeTabPerWorkspace: [["ws", "saved-terminal"]],
  } }));
  const noop = () => {};
  const boundary: Record<string, unknown> = {
    "@xterm/xterm": { Terminal: Screen },
    "@xterm/addon-fit": { FitAddon: class { fit() {} dispose() {} } },
    "@xterm/addon-unicode11": { Unicode11Addon: class {} },
    "src/features/terminal/pty": {
      onPtyEvent: async (callback: (event: PtyEvent) => void) => { event = callback; return noop; },
      ptySpawn: async (args: SpawnArgs) => { calls.push(args); return spawn(args); },
      ptyWrite: async (_id: string, text: string) => { writes.push(text); },
      ptyKill: async () => {}, ptyResize: async () => {}, ptyAckBytes: async () => {},
      ptyLoadTerminalHistory: async () => undefined, ptyPersistTerminalHistory: async () => {},
      ptyDeleteTerminalHistory: async (id: string) => { deleted.push(id); },
    },
    "src/features/terminal/localStorage": { subsystemStorage: () => ({
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => { storage.set(key, value); },
    }) },
    "src/settings/appPrefs": { getAppPrefs: () => ({ experimental_tab_freak_mode: false }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: noop, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: noop },
    "src/features/terminal/FindBar": { FindBar: () => null, useTerminalFind: () => ({}) },
    "src/components/Icons": { TerminalIcon: () => null },
  };
  const modules = new Map<string, { exports: ModuleExports }>();
  function load(name: string): ModuleExports {
    name = name.replace(/\.tsx?$/, "");
    const existing = modules.get(name);
    if (existing) return existing.exports;
    const file = [name + ".ts", name + ".tsx"].find((p) => { try { readFileSync(p); return true; } catch { return false; } });
    assert.ok(file, name);
    const module: { exports: ModuleExports } = { exports: {} };
    modules.set(name, module);
    const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
      fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (dep: string): unknown => {
      if (dep === "react" || dep === "react/jsx-runtime") return deps(dep);
      if (dep.endsWith(".css")) return {};
      const key = dep.startsWith(".") ? resolve(dirname(file), dep).slice(process.cwd().length + 1).replace(/\.tsx?$/, "") : dep;
      return Object.prototype.hasOwnProperty.call(boundary, key) ? boundary[key] : load(key);
    };
    runInNewContext(`(function(require,module,exports){${outputText}\n})`, {
      console, Error, TextDecoder, TextEncoder, setTimeout, clearTimeout, crypto: { randomUUID: () => "fixture-id" },
      getComputedStyle: () => ({ getPropertyValue: () => "" }),
      document: { documentElement: {}, createElement: () => ({ className: "", remove: noop }) },
    }, { filename: file })(require, module, module.exports);
    return module.exports;
  }
  const session = load("src/features/terminal/session");
  const { TerminalHost: Host } = load("src/features/terminal/TerminalPanel");
  assert.ok(session.openTab && session.getTabs && session.terminalOf && session.closeTab && Host);
  return { session, Host, calls, screens, deleted, writes, emit: (e: PtyEvent) => { assert.ok(event); event(e); } };
}

test("backend spawn rejection retains the selected tab and its screen", async () => {
  const f = fixture(async () => { throw new Error("shell unavailable"); });
  await assert.rejects(f.session.openTab!("ws", "/workspace", "echo start"), /shell unavailable/);
  const [tab] = f.session.getTabs!("ws").tabs;
  assert.ok(tab, "failed terminal remains registered");
  assert.equal(tab.status, "spawn_error");
  assert.equal(f.session.getTabs!("ws").activeId, tab.id);
  assert.equal(f.screens[0].disposed, false);
  assert.equal(f.session.terminalOf!(tab.id), f.screens[0]);
  f.screens[0].input("do not send");
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.deleted, []);
});

test("Retry targets the retained id, is single-flight, and leaves ready/exited sessions alone", async () => {
  let finish: ((id: string) => void) | undefined;
  const f = fixture(async () => {
    if (f.calls.length === 1) throw new Error("first attempt failed");
    return new Promise<string>((resolve) => { finish = resolve; });
  });
  await assert.rejects(f.session.openTab!("ws", "/workspace", "echo start"));
  assert.ok(f.session.retryTab, "same-id Retry is available");
  const id = f.calls[0].id!;
  const retry = f.session.retryTab(id);
  await f.session.retryTab(id);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].id, id);
  assert.equal(f.calls[1].initialCommand, "echo start");
  assert.equal(f.session.getTabs!("ws").tabs[0].status, "starting");
  assert.ok(finish);
  finish(id);
  await retry;
  f.emit({ kind: "ready", id, pid: 12 });
  assert.equal(f.session.getTabs!("ws").tabs[0].status, "running");
  await f.session.retryTab(id);
  f.emit({ kind: "exit", id, exitCode: 1, signal: null });
  await f.session.retryTab(id);
  await f.session.retryTab("missing");
  assert.equal(f.calls.length, 2);
});

test("a repeated Retry rejection keeps the same terminal retryable", async () => {
  const f = fixture(async () => { throw new Error(`failure ${f.calls.length}`); });
  await assert.rejects(f.session.openTab!("ws", "/workspace"));
  assert.ok(f.session.retryTab);
  const id = f.calls[0].id!;
  await assert.rejects(f.session.retryTab(id), /failure 2/);
  assert.equal(f.session.getTabs!("ws").tabs[0].id, id);
  assert.equal(f.session.getTabs!("ws").tabs[0].status, "spawn_error");
  assert.equal(f.screens[0].disposed, false);
});

test("restored failed terminals and their saved history are not forgotten", async () => {
  const f = fixture(async () => { throw new Error("restored shell failed"); }, true);
  assert.ok(f.session.restoreWorkspaceTabs);
  assert.equal(await f.session.restoreWorkspaceTabs("ws", "/workspace"), true);
  assert.equal(f.session.getTabs!("ws").tabs[0].id, "saved-terminal");
  assert.equal(f.session.getTabs!("ws").tabs[0].status, "spawn_error");
  assert.deepEqual(f.deleted, []);
});

test("center creation exposes a retained failed terminal without changing its placement", async () => {
  const f = fixture(async () => { throw new Error("center shell failed"); });
  const shown: string[] = [];
  assert.ok(f.session.onCenterTabOpened && f.session.openBigTab);
  f.session.onCenterTabOpened((_ws, id) => shown.push(id));
  await assert.rejects(f.session.openBigTab("ws", "/workspace", { command: "custom shell" }));
  const [tab] = f.session.getTabs!("ws").tabs;
  assert.ok(tab);
  assert.equal(tab.placement, "center");
  assert.deepEqual(shown, [tab.id]);
});

test("actual TerminalHost shows the retained error and its Retry button", async () => {
  const f = fixture(async () => { throw new Error("shell unavailable"); });
  await assert.rejects(f.session.openTab!("ws", "/workspace"));
  const [tab] = f.session.getTabs!("ws").tabs;
  assert.ok(tab, "error rendering needs the retained tab");
  let tree: ReturnType<typeof renderer.create> | undefined;
  await renderer.act(async () => { tree = renderer.create(React.createElement(f.Host, { id: tab.id, status: tab.status })); });
  assert.ok(tree);
  const buttons = tree.root.findAllByType("button");
  const retry = buttons.find((button) => button.children.includes("Retry"));
  assert.ok(retry, "failed terminal exposes Retry");
  assert.equal(retry.props.disabled, false);
  assert.equal(tree.root.findByProps({ role: "alert" }).findByType("span").children.join(""), "Failed to start terminal: shell unavailable");
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /Starting terminal/);
  assert.equal(tree.root.findAll((node) => node.props["data-terminal"] === true).length, 1);
  assert.ok(retry.props.onClick);
  const onRetry = retry.props.onClick;
  await renderer.act(async () => { onRetry(); });
  assert.equal(f.calls.length, 2);
  await renderer.act(async () => { tree?.unmount(); });
});

test("failed tab transitions preserve title, selection, placement and clear error on Retry", () => {
  let state = tabsReducer(emptyTabs(), { type: "open", id: "kept", placement: "center", title: "Kept" });
  state = tabsReducer(state, { type: "failed", id: "kept", error: "shell unavailable" });
  assert.equal(state.tabs[0].status, "spawn_error");
  state = tabsReducer(state, { type: "retry", id: "kept" });
  assert.equal(state.tabs[0].status, "starting");
  assert.equal(state.tabs[0].title, "Kept");
  assert.equal(state.tabs[0].placement, "center");
  assert.equal(state.activeId, null);
});
