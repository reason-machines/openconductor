import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { RunState, RunStatus } from "./model.ts";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Renderer = { unmount: () => void; update: (element: ReactNode) => void };
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof ScriptsPanel>;
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel };
type WireListener = (event: { payload: unknown }) => void;
type Resize = { workspaceId: string; scriptId: string; runId: string; cols: number; rows: number };
type Geometry = Pick<Resize, "cols" | "rows">;
const a: Props["workspace"] = { id: "input-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "input-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "input-repo", name: "Input", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture(initial: RunState = "running", tab: Props["tab"] = "run", identified = true) {
  const resizes: Resize[] = [];
  const observers: Observer[] = [];
  let geometry: Geometry = { cols: 80, rows: 24 };
  const screens: Screen[] = [];
  const listeners = new Set<WireListener>();
  const modules = new Map<string, { exports: SourceExports }>();
  let workspace = a;
  let scriptId = "dev";
  let state = initial;
  let runId = "run-1";
  class Screen {
    options: Record<string, unknown>;
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    inputs = new Set<(data: string) => void>();
    disposed = false;
    cols = 80;
    rows = 24;
    output = "";
    resizeListeners = new Set<(size: Geometry) => void>();
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon(addon: { activate?: (screen: Screen) => void }) { addon.activate?.(this); }
    open() {}
    write(data: string) { this.output += data; }
    resize(cols: number, rows: number) {
      if (this.cols === cols && this.rows === rows) return;
      this.cols = cols; this.rows = rows;
      for (const listener of this.resizeListeners) listener({ cols, rows });
    }
    onResize(listener: (size: Geometry) => void) {
      this.resizeListeners.add(listener);
      return { dispose: () => this.resizeListeners.delete(listener) };
    }
    focus() {}
    getSelection() { return ""; }
    onData(callback: (data: string) => void) {
      this.inputs.add(callback);
      return { dispose: () => this.inputs.delete(callback) };
    }
    type(data: string) {
      if (this.options.disableStdin !== true && !this.disposed) for (const input of this.inputs) input(data);
    }
    dispose() { this.disposed = true; }
  }
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: "fixture-setup", setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: ["dev", "test"].map((id) => ({ id, label: id, command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" })),
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return {
        runs: [Object.assign({ workspaceId: workspace.id, scriptId, state, exit: null } satisfies RunStatus, identified ? { runId } : {})], history: [scriptId],
      };
      case "setup_script_status": return { state: "running", log: "setup output\n", last: null };
      case "run_script_output": return "script output\n";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_resize": {
        if (typeof args.workspaceId !== "string" || typeof args.scriptId !== "string" || typeof args.runId !== "string" || typeof args.cols !== "number" || typeof args.rows !== "number") assert.fail("generation-qualified measured geometry payload");
        assert.ok(Number.isInteger(args.cols) && args.cols > 0);
        assert.ok(Number.isInteger(args.rows) && args.rows > 0);
        resizes.push({ workspaceId: args.workspaceId, scriptId: args.scriptId, runId: args.runId, cols: args.cols, rows: args.rows });
        return true;
      }
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in resize regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/ui/Tooltip": { ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert },
    "src/components/PopoverMenu": { PopoverMenu: inert },
    "src/features/terminal/FindBar": { FindBar: inert, useBufferFind: () => ({ open: inert }) },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: () => () => {}, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: () => () => {} },
  };
  const sources = new Set([
    "src/components/ScriptsPanel", "src/components/ScriptOutput", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/output", "src/scripts/preview", "src/scripts/runTab", "src/spotlight/testingApi", "src/spotlight/testing",
  ]);
  class Observer {
    connected = false;
    callback: () => void;
    constructor(callback: () => void) { this.callback = callback; observers.push(this); }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
    fire() { if (this.connected) this.callback(); }
  }
  class Fit {
    screen?: Screen;
    activate(screen: Screen) { this.screen = screen; }
    proposeDimensions() { return geometry; }
    fit() { this.screen?.resize(geometry.cols, geometry.rows); }
  }
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
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No link warning in runningResize regression"); } };
      if (name === "@xterm/addon-fit") return { FitAddon: Fit };
      if (name === "@xterm/addon-unicode11") return { Unicode11Addon: class {} };
      if (name === "@tauri-apps/api/core") return { invoke };
      if (name === "@tauri-apps/api/event") return {
        listen: async (event: string, listener: WireListener) => {
          if (event === "scripts://event") listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected package dependency: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${outputText}\n})`, {
      console, document: { documentElement: {}, activeElement: null }, getComputedStyle: () => ({ getPropertyValue: () => "" }),
      ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptsPanel: Panel } = load("src/components/ScriptsPanel");
  assert.ok(Panel);
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
  const panel = () => React.createElement(Panel, { repo, workspace, tab, active: true, onShowRun: inert, onAddRunScript: inert });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => host }); });
  async function refresh() {
    await act(async () => { for (const listener of [...listeners]) listener({ payload: { type: "runStarted", workspaceId: workspace.id } }); });
  }
  return {
    resizes, screens, observers,
    async measure(size: Geometry = { cols: 96, rows: 32 }, visible = true) {
      geometry = size;
      host.clientWidth = visible ? 960 : 0;
      host.clientHeight = visible ? 640 : 0;
      await act(async () => { for (const observer of observers) observer.fire(); });
    },
    async setState(next: RunState, nextRunId = runId) { state = next; runId = nextRunId; await refresh(); },
    async show(nextWorkspace: Props["workspace"], nextScriptId = scriptId) {
      workspace = nextWorkspace;
      scriptId = nextScriptId;
      await act(async () => { renderer.update(panel()); });
      await refresh();
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

const measured = { cols: 96, rows: 32 };
const initialSize = { cols: 80, rows: 24 };
const payload = (workspaceId = a.id, runId = "run-1", scriptId = "dev") => ({ workspaceId, scriptId, runId, ...measured });

test("measured running-script geometry reaches the real panel and API with the current generation", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.resizes.length = 0;
  await f.measure(measured);
  assert.equal(f.screens.at(-1)?.cols, 96, "FitAddon boundary updated the actual mounted screen");
  assert.equal(f.screens.at(-1)?.rows, 32);
  assert.deepEqual(f.resizes, [payload()], "the current source must reach the resize IPC, not only fit local output");
});

test("identical 96x32 geometry never resizes a nonrunning run", async () => {
  for (const state of ["starting", "waiting_for_setup", "stopping", "stopped"] satisfies RunState[]) {
    const f = await fixture(state);
    try {
      f.resizes.length = 0;
      await f.measure(measured);
      assert.equal(f.screens.at(-1)?.cols, 96, "retained output still reflows");
      assert.equal(f.screens.at(-1)?.rows, 32);
      assert.deepEqual(f.resizes, [], state);
    } finally { await f.close(); }
  }
});

test("running without a generation does not send unqualified geometry", async (t) => {
  const f = await fixture("running", "run", false);
  t.after(f.close);
  await f.measure(measured);
  assert.deepEqual(f.resizes, []);
});

test("same mounted screen disables resize on stop and sends measured geometry to a replacement generation", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const screen = f.screens.at(-1);
  f.resizes.length = 0;
  await f.measure(measured);
  assert.deepEqual(f.resizes, [payload()]);
  for (const state of ["stopping", "stopped"] satisfies RunState[]) {
    await f.setState(state);
    f.resizes.length = 0;
    await f.measure(initialSize);
    await f.measure(measured);
    assert.deepEqual(f.resizes, [], state);
  }
  f.resizes.length = 0;
  await f.setState("running", "run-2");
  assert.equal(f.screens.at(-1), screen, "the current output buffer must not be remounted");
  assert.deepEqual(f.resizes, [payload(a.id, "run-2")], "callback identity change must propagate already-measured geometry even when dimensions are unchanged");
});

test("workspace replacement never retargets a disposed terminal", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const old = f.screens.at(-1);
  assert.ok(old);
  await f.show(b, "test");
  await f.measure(initialSize);
  f.resizes.length = 0;
  await f.measure(measured);
  assert.deepEqual(f.resizes, [payload(b.id, "run-1", "test")]);
  assert.equal(old.disposed, true);
  assert.equal(old.resizeListeners.size, 0);
  old.resize(96, 32);
  assert.deepEqual(f.resizes, [payload(b.id, "run-1", "test")]);
});

test("a hidden zero-size host does not emit backend geometry and reveal uses its measured size", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.resizes.length = 0;
  await f.measure(measured, false);
  assert.deepEqual(f.resizes, []);
  assert.equal(f.screens.at(-1)?.cols, 80);
  await f.measure(measured, true);
  assert.deepEqual(f.resizes, [payload()]);
});

test("setup output fits locally without resizing a run-script PTY", async (t) => {
  const f = await fixture("running", "setup");
  t.after(f.close);
  await f.measure(measured);
  assert.equal(f.screens.at(-1)?.cols, 96);
  assert.deepEqual(f.resizes, []);
});

test("unmount disposes geometry subscriptions without altering output bytes", async () => {
  const f = await fixture();
  const screen = f.screens.at(-1);
  assert.ok(screen);
  const before = screen.output;
  await f.measure(measured);
  assert.equal(screen.output, before);
  await f.close();
  assert.equal(screen.resizeListeners.size, 0);
  assert.ok(f.observers.every((observer) => !observer.connected));
  const sent = f.resizes.slice();
  screen.resize(80, 24);
  assert.deepEqual(f.resizes, sent);
});
