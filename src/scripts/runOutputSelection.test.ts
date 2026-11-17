import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { ScriptOutput } from "../components/ScriptOutput";
import type { PanelStrip } from "../components/PanelStrip";
import type { RunState, RunStatus } from "./model.ts";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Renderer = {
  unmount: () => void;
  update: (element: ReactNode) => void;
  root: {
    findByProps: (props: Record<string, unknown>) => { props: { onClick: () => void } };
    findAllByType: (type: string) => { children: unknown[]; props: { onClick: (event: { stopPropagation(): void }) => void } }[];
  };
};
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof ScriptsPanel>;
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel; ScriptOutput?: typeof ScriptOutput; PanelStrip?: typeof PanelStrip };
type WireListener = (event: { payload: unknown }) => void;
const workspace: Props["workspace"] = { id: "selection-workspace", name: "Cursor", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/cursor" };
const repo: Props["repo"] = { id: "selection-repo", name: "Cursor", path: "/fixture/repo", defaultBranch: "main", workspaces: [workspace] };

async function fixture({ initial = "running", tab = "run", standalone = false, spotlight = false }: {
  initial?: RunState; tab?: Props["tab"]; standalone?: boolean; spotlight?: boolean;
} = {}) {
  let activeWorkspace = workspace;
  let target: string | undefined = "selection-chat-A";
  let accepted = true;
  let callbackEnabled = true;
  const requests: { sessionId: string | undefined; text: string }[] = [];
  const emptyTabs = { tabs: [], activeId: null, nextId: 1 };
  const screens: Screen[] = [];
  const observers: Observer[] = [];
  const listeners = new Set<WireListener>();
  const spotlightListeners = new Set<WireListener>();
  const documentElement = {};
  const colors: Record<string, string> = { "--text": "fixture-foreground-light", "--bg": "fixture-background-light", "--terminal-transparent": "fixture-transparent" };
  const modules = new Map<string, { exports: SourceExports }>();
  let state = initial;
  class Screen {
    options: Record<string, unknown>;
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    cols = 80;
    rows = 24;
    focusCalls = 0;
    disposed = false;
    output = "";
    selection = "";
    clearSelectionCalls = 0;
    selectionListeners = new Set<() => void>();
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() {}
    write(data: string) { this.output += data; }
    getSelection() { return this.selection; }
    onSelectionChange(callback: () => void) {
      this.selectionListeners.add(callback);
      return { dispose: () => this.selectionListeners.delete(callback) };
    }
    clearSelection() { this.clearSelectionCalls++; this.selection = ""; }
    select(text: string) { this.selection = text; for (const callback of this.selectionListeners) callback(); }
    focus() { this.focusCalls++; }
    onData() { return { dispose() {} }; }
    dispose() { this.disposed = true; this.selectionListeners.clear(); }
  }
  class Observer {
    target: unknown;
    connected = false;
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe(target: unknown) { this.target = target; this.connected = true; }
    disconnect() { this.connected = false; }
  }
  async function invoke(name: string): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: "fixture-setup", setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: spotlight ? [] : [{ id: "dev", label: "dev", command: "fixture-dev", args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }],
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: spotlight ? [] : [{ workspaceId: activeWorkspace.id, scriptId: "dev", runId: "selection-run", state, exit: null } satisfies RunStatus], history: ["dev"] };
      case "setup_script_status": return { state: "running", log: "setup output\n", last: null };
      case "run_script_output": return "script output\n";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: spotlight, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: spotlight, workspaceId: spotlight ? activeWorkspace.id : null };
      case "run_script_resize": return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in Run selection regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/ui/Tooltip": { ShortcutHint: inert, Tooltip: ({ children }: { children: ReactNode }) => children },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert, TerminalIcon: inert },
    "src/features/files/panelIcons": { ChevronDownIcon: inert, ChevronRightIcon: inert, PlusIcon: inert, XIcon: inert },
    "src/features/terminal/TerminalPanel": { TerminalHost: inert },
    "src/features/terminal/session": {
      subscribeTabs: () => () => {}, getTabs: () => emptyTabs, restoreWorkspaceTabs: async () => {},
      openTab: async () => { throw new Error("No PTY spawn in selection regression"); }, closeTab: inert, selectTab: inert,
    },
    "src/features/terminal/tabs": { terminalTabs: () => [], canOpenTerminal: () => true },
    "src/features/terminal/shellIntegration": { tabLabel: (label: string) => label },
    "src/settings/appPrefs": { useAppPrefs: () => ({ experimental_tab_freak_mode: false }) },
    "src/settings/useBoolPref": { useBoolPref: () => false },
    "src/features/chat/ChatModelPicker": { openRepoSettingsPage: inert },
    "src/components/PopoverMenu": { PopoverMenu: inert },
    "src/features/terminal/FindBar": { FindBar: inert, useBufferFind: () => ({ open: inert }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: () => () => {}, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: () => () => {} },
  };
  const sources = new Set([
    "src/components/PanelStrip", "src/components/ScriptsPanel", "src/components/ScriptOutput", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/output", "src/scripts/preview", "src/scripts/runTab", "src/spotlight/testingApi", "src/spotlight/testing",
  ]);
  function load(file: string): SourceExports {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    assert.ok(sources.has(file), `Unexpected source dependency: ${file}`);
    const path = file + (file.startsWith("src/components/") ? ".tsx" : ".ts");
    const module: { exports: SourceExports } = { exports: {} };
    modules.set(file, module);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name === "react-dom") return { createPortal: (children: ReactNode) => children };
      if (name === "@xterm/xterm") return { Terminal: Screen };
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No link warning in runOutputSelection regression"); } };
      if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
      if (name === "@xterm/addon-unicode11") return { Unicode11Addon: class {} };
      if (name === "@tauri-apps/api/core") return { invoke };
      if (name === "@tauri-apps/api/event") return {
        listen: async (event: string, listener: WireListener) => {
          if (event === "scripts://event") listeners.add(listener);
          if (event === "spotlight://event") spotlightListeners.add(listener);
          return () => { listeners.delete(listener); spotlightListeners.delete(listener); };
        },
      };
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected package dependency: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${outputText}\n})`, {
      console, document: { documentElement, activeElement: null }, getComputedStyle: () => ({ getPropertyValue: (name: string) => colors[name] ?? "" }),
      ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { PanelStrip: Strip } = load("src/components/PanelStrip");
  const { ScriptOutput: Output } = load("src/components/ScriptOutput");
  assert.ok(Strip);
  assert.ok(Output);
  const ReadyStrip = Strip;
  const ReadyOutput = Output;
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
  function element() {
    const renderedTarget = target;
    return standalone
      ? React.createElement(ReadyOutput, { output: "default output", onInput: async () => {} })
      : React.createElement(ReadyStrip, {
          repo, workspace: activeWorkspace, open: true, setOpen: inert, view: tab, setView: inert,
          cwd: activeWorkspace.path ?? repo.path, chatSessionId: renderedTarget,
          onAddTerminalSelection: callbackEnabled ? (text: string) => { requests.push({ sessionId: renderedTarget, text }); return accepted; } : undefined,
        });
  }
  let renderer: Renderer;
  await act(async () => { renderer = create(element(), { createNodeMock: () => host }); });
  if (spotlight) await act(async () => {
    for (const listener of spotlightListeners) listener({ payload: { type: "started", repoRoot: repo.path, workspaceId: activeWorkspace.id, leftoverRestoreError: null } });
  });
  function screen() {
    const current = screens.at(-1);
    assert.ok(current);
    return current;
  }

  return {
    screen, screens, requests,
    buttons: () => renderer.root.findAllByType("button").filter((button) => button.children.join("") === "Add to chat"),
    async select(text: string, terminal = screen()) { await act(async () => terminal.select(text)); },
    async click() {
      const button = this.buttons()[0];
      assert.ok(button, "actual Run output exposes Add to chat");
      let stopped = false;
      await act(async () => button.props.onClick({ stopPropagation() { stopped = true; } }));
      assert.equal(stopped, true, "the action does not bubble to output focus");
    },
    async target(next: string | undefined) { target = next; await act(async () => renderer.update(element())); },
    accept(next: boolean) { accepted = next; },
    async callback(enabled: boolean) { callbackEnabled = enabled; await act(async () => renderer.update(element())); },
    async workspace(id: string) {
      activeWorkspace = { ...workspace, id, path: `/fixture/${id}` };
      await act(async () => renderer.update(element()));
    },
    async setState(next: RunState) {
      state = next;
      await act(async () => { for (const listener of [...listeners]) listener({ payload: { type: "runFinished", workspaceId: activeWorkspace.id } }); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}


test("actual Run output offers the action only for nonblank selection and a target chat", async (t) => {
  const f = await fixture(); t.after(f.close);
  assert.equal(f.buttons().length, 0);
  await f.select(" \t\n"); assert.equal(f.buttons().length, 0);
  await f.select("\u0000\u001b[31m\u001b[0m"); assert.equal(f.buttons().length, 0);
  await f.select("selected output"); assert.equal(f.buttons().length, 1);
  await f.target(undefined); assert.equal(f.buttons().length, 0);
  await f.target("chat-B"); assert.equal(f.buttons().length, 1);
  await f.callback(false); assert.equal(f.buttons().length, 0);
  await f.callback(true); await f.select("selected output"); assert.equal(f.buttons().length, 1);
  await f.select(""); assert.equal(f.buttons().length, 0);
});

test("Run selection reaches the existing strip callback normalized and without truncation", async (t) => {
  const f = await fixture(); t.after(f.close);
  const long = "x".repeat(12000);
  await f.select(`  \u001b[31m${long}\u001b[0m\u0000\n\tsecond line  `);
  await f.click();
  assert.deepEqual(f.requests, [{ sessionId: "selection-chat-A", text: `${long}\n\tsecond line` }]);
});

test("stopping Run retains the action, output and terminal instance without enabling stdin", async (t) => {
  const f = await fixture(); t.after(f.close);
  const terminal = f.screen(); const output = terminal.output;
  await f.select("retained selected output");
  await f.setState("stopped");
  assert.equal(f.screen(), terminal);
  assert.equal(terminal.output, output);
  assert.equal(terminal.options.disableStdin, true);
  await f.click();
  assert.equal(f.requests[0]?.text, "retained selected output");
});

test("accepted Run selection clears action state without clearing xterm selection", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.select("keep actual selection"); await f.click();
  assert.equal(f.buttons().length, 0);
  assert.equal(f.screen().selection, "keep actual selection");
  assert.equal(f.screen().clearSelectionCalls, 0);
});

test("a rejected Run selection callback retains the action for retry", async (t) => {
  const f = await fixture(); t.after(f.close); f.accept(false);
  await f.select("retry me"); await f.click();
  assert.equal(f.buttons().length, 1);
  f.accept(true); await f.click();
  assert.equal(f.requests.length, 2);
  assert.equal(f.buttons().length, 0);
});

test("Run selection uses the current strip chat target instead of a stale callback", async (t) => {
  const f = await fixture(); t.after(f.close);
  await f.select("selected before target change");
  await f.target("chat-B"); await f.click();
  assert.deepEqual(f.requests, [{ sessionId: "chat-B", text: "selected before target change" }]);
});

test("Run workspace replacement and unmount release old selection subscriptions", async () => {
  const f = await fixture();
  let current: ReturnType<typeof f.screen> | undefined;
  try {
    const old = f.screen();
    assert.equal(old.selectionListeners.size, 1);
    await f.select("old selected text"); await f.workspace("selection-workspace-B");
    current = f.screen();
    assert.notEqual(current, old);
    assert.equal(old.selectionListeners.size, 0);
    assert.equal(f.buttons().length, 0);
    await f.select("stale A", old); assert.equal(f.buttons().length, 0);
    await f.select("current B"); assert.equal(f.buttons().length, 1);
  } finally { await f.close(); }
  assert.ok(current);
  assert.equal(current.selectionListeners.size, 0);
});

test("Setup output does not acquire the Run selection action", async (t) => {
  const f = await fixture({ tab: "setup" }); t.after(f.close);
  await f.select("setup selection");
  assert.equal(f.buttons().length, 0);
  assert.equal(f.screen().options.disableStdin, true);
  assert.deepEqual(f.requests, []);
});

test("Spotlight output does not acquire the ordinary Run selection action", async (t) => {
  const f = await fixture({ spotlight: true }); t.after(f.close);
  await f.select("spotlight selection");
  assert.equal(f.buttons().length, 0);
  assert.deepEqual(f.requests, []);
});

test("standalone output with input keeps its existing no-selection-action default", async (t) => {
  const f = await fixture({ standalone: true }); t.after(f.close);
  await f.select("default output selection");
  assert.equal(f.buttons().length, 0);
  assert.equal(f.screen().options.disableStdin, false);
  assert.deepEqual(f.requests, []);
});
