import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { RunStatus } from "./model.ts";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[]; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Renderer = { root: Node; unmount: () => void; update: (element: ReactNode) => void };
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof ScriptsPanel>;
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel };
const a: Props["workspace"] = { id: "surface-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "surface-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "surface-repo", name: "Run surface", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture({ task = "dev", legacy = false, empty = false, failStart = false } = {}) {
  const commands: { name: string; args: Record<string, unknown> }[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  const listeners = new Set<(event: { payload: unknown }) => void>();
  const keybindings = new Map<string, () => unknown>();
  const screens: Screen[] = [];
  const runs = new Map<string, RunStatus[]>([
    [a.id, [{ workspaceId: a.id, scriptId: task, ...(legacy ? {} : { runId: "run-1" }), state: "stopped", exit: [0, null] }]],
    [b.id, [{ workspaceId: b.id, scriptId: task, runId: "run-1", state: "stopped", exit: [0, null] }]],
  ]);
  const output = new Map([[a.id, empty ? "" : "previous transcript\n"], [b.id, "other workspace transcript\n"]]);
  let workspace = a;
  let nextId = 2;
  class Screen {
    options: Record<string, unknown>;
    element = new EventTarget();
    unicode = { activeVersion: "6" };
    cols = 80;
    rows = 24;
    disposed = false;
    output = "";
    selection = "";
    selectionListeners = new Set<() => void>();
    renderListeners = new Set<() => void>();
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    get buffer() {
      const lines = this.output.split("\n");
      return { active: { length: lines.length, getLine: (y: number) => {
        const line = lines[y];
        return line === undefined ? undefined : { isWrapped: false, length: line.length, getCell: (x: number) => x < line.length ? { getWidth: () => 1, getChars: () => line[x] } : undefined };
      } } };
    }
    loadAddon() {}
    open() {}
    write(data: string) {
      // Only plain fixture output plus the production RIS reset is modeled.
      // RIS clears selection too; the regression does not assume stale xterm selection.
      if (data.startsWith("\x1bc")) { this.output = ""; this.clearSelection(); data = data.slice(2); }
      this.output += data;
      for (const listener of this.renderListeners) listener();
    }
    getSelection() { return this.selection; }
    onSelectionChange(listener: () => void) { this.selectionListeners.add(listener); return { dispose: () => this.selectionListeners.delete(listener) }; }
    onRender(listener: () => void) { this.renderListeners.add(listener); return { dispose: () => this.renderListeners.delete(listener) }; }
    clearSelection() { this.selection = ""; for (const listener of this.selectionListeners) listener(); }
    select(column: number, row: number, length: number) { this.selection = this.output.split("\n")[row]?.slice(column, column + length) ?? ""; for (const listener of this.selectionListeners) listener(); }
    scrollToLine() {}
    focus() {}
    onData() { return { dispose() {} }; }
    dispose() { this.disposed = true; this.renderListeners.clear(); this.selectionListeners.clear(); }
  }
  class Observer { observe() {} disconnect() {} }
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = String(args.workspaceId ?? (args.workspace as { workspaceId?: string } | undefined)?.workspaceId);
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: ["dev", "test"].map((id) => ({ id, label: id === "dev" ? "Dev" : "Test", command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" })), managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: (runs.get(workspaceId) ?? []).map((run) => ({ ...run })), history: [task] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return output.get(workspaceId) ?? null;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_resize": return true;
      case "run_script_start": {
        commands.push({ name, args });
        if (failStart) throw "fixture start rejected"; // Tauri command rejections are serialized strings.
        const runId = `run-${nextId++}`;
        runs.set(workspaceId, [{ workspaceId, scriptId: String(args.scriptId), runId, state: "running", exit: null }]);
        output.set(workspaceId, "replacement transcript\n");
        return runId;
      }
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in run-surface regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: (handlers: Record<string, () => unknown>) => { for (const [key, handler] of Object.entries(handlers)) keybindings.set(key, handler); } },
    "src/keybindings/dispatcher": { PRIORITY: { TERMINAL: 1 } },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/ui/Tooltip": { Tooltip: ({ children }: { children: ReactNode }) => children, ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert, SearchIcon: inert, CloseIcon: inert },
    "src/components/PopoverMenu": { PopoverMenu: inert },
    "src/features/terminal/session": { getFindRequests: () => 0, subscribeTabs: () => () => {}, terminalOf: () => null },
    "src/features/terminal/font": { currentTerminalFont: () => ({ family: "monospace", size: 12 }), onTerminalFont: () => () => {}, TERMINAL_LINE_HEIGHT: 1.2 },
    "src/features/terminal/scrollback": { currentScrollbackRows: () => 1000, onScrollbackRows: () => () => {} },
  };
  const sources = new Set([
    "src/components/ScriptsPanel", "src/components/ScriptOutput", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/preview", "src/scripts/runTab", "src/scripts/output", "src/spotlight/testingApi", "src/spotlight/testing",
    "src/features/terminal/FindBar", "src/features/terminal/find",
  ]);
  function load(file: string): SourceExports {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    assert.ok(sources.has(file), `Unexpected source dependency: ${file}`);
    const path = file + (file.startsWith("src/components/") || file.endsWith("/FindBar") ? ".tsx" : ".ts");
    const module: { exports: SourceExports } = { exports: {} };
    modules.set(file, module);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name === "react-dom") return { createPortal: (children: ReactNode) => children };
      if (name === "@tauri-apps/api/core") return { invoke };
      if (name === "@tauri-apps/api/event") return { listen: async (event: string, listener: (event: { payload: unknown }) => void) => { if (event === "scripts://event") listeners.add(listener); return () => listeners.delete(listener); } };
      if (name === "@xterm/xterm") return { Terminal: Screen };
      if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
      if (name === "@xterm/addon-unicode11") return { Unicode11Addon: class {} };
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No native dialog in run-surface regression"); } };
      if (name.endsWith(".css")) return {};
      assert.ok(name.startsWith("."), `Unexpected package dependency: ${name}`);
      const relative = resolve(dirname(path), name).slice(process.cwd().length + 1).replace(/\\/g, "/").replace(/\.tsx?$/, "");
      return Object.prototype.hasOwnProperty.call(boundaries, relative) ? boundaries[relative] : load(relative);
    };
    runInNewContext(`(function(require,module,exports){${outputText}\n})`, {
      console, document: { documentElement: {}, activeElement: {} }, getComputedStyle: () => ({ getPropertyValue: () => "fixture-color" }), ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptsPanel: Panel } = load("src/components/ScriptsPanel");
  assert.ok(Panel);
  const panel = () => React.createElement(Panel, { repo, workspace, tab: "run", active: true, actionsSlot: {} as HTMLElement, onShowRun: inert, onAddRunScript: inert });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({ clientWidth: 800, clientHeight: 400, contains: () => true, focus() {}, select() {}, getBoundingClientRect: () => ({ right: 200, bottom: 40 }) }) }); });
  const nodes = (predicate: (node: Node) => boolean) => renderer.root.findAll(predicate);
  const searches = () => nodes((node) => node.props.role === "search");
  const inputs = () => nodes((node) => node.type === "input" && node.props.placeholder === "Find");
  async function emit(payload: unknown) { await act(async () => { for (const listener of [...listeners]) listener({ payload }); }); }
  return {
    commands, screens, searches,
    hasText: (text: string) => nodes((node) => node.children.filter((child) => typeof child === "string").join("") === text).length > 0,
    screen: () => { const screen = screens.at(-1); assert.ok(screen); return screen; },
    query: () => { assert.equal(inputs().length, 1, "actual FindBar input"); return inputs()[0].props.value; },
    async search(query: string) {
      await act(async () => { const handler = keybindings.get("terminal.search"); assert.ok(handler); handler(); });
      const input = inputs()[0]; assert.ok(input);
      await act(async () => { (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: query } }); });
    },
    async openSearch() { await act(async () => { const handler = keybindings.get("terminal.search"); assert.ok(handler); handler(); }); },
    async start() {
      const matches = nodes((node) => node.type === "button" && node.props["aria-label"] === (task === "dev" ? "Run Dev" : "Run Test"));
      assert.equal(matches.length, 1, "one real run control"); assert.equal(matches[0].props.disabled, false);
      await act(async () => { (matches[0].props.onClick as () => void)(); });
    },
    async refresh() { await emit({ type: "runStarted", workspaceId: workspace.id, scriptId: task }); },
    async finish() {
      runs.set(workspace.id, (runs.get(workspace.id) ?? []).map((run) => ({ ...run, state: "stopped", exit: [0, null] })));
      await emit({ type: "runFinished", workspaceId: workspace.id, scriptId: task });
    },
    async switchWorkspace(next: Props["workspace"]) { workspace = next; await act(async () => renderer.update(panel())); },
    close: () => act(async () => renderer.unmount()),
  };
}

for (const task of ["dev", "test"]) {
  test(`${task} replacement owns a fresh terminal/find surface, not the predecessor's search`, async (t) => {
    const f = await fixture({ task }); t.after(f.close);
    const previous = f.screen();
    await f.search("transcript"); assert.equal(f.query(), "transcript");
    await f.start();
    assert.equal(f.searches().length, 0, "a replacement run must not inherit the predecessor's open Find bar");
    assert.notEqual(f.screen(), previous, "actual run identity owns the terminal lifetime, not just its output string");
    assert.equal(previous.disposed, true);
    await f.openSearch(); assert.equal(f.query(), "", "new surface starts with a blank query");
    assert.deepEqual(f.commands.map((command) => [command.name, command.args.scriptId]), [["run_script_start", task]]);
  });
}

test("same-run refresh and completion retain its terminal and open search", async (t) => {
  const f = await fixture(); t.after(f.close);
  const screen = f.screen(); await f.search("transcript");
  await f.refresh(); await f.finish();
  assert.equal(f.screen(), screen); assert.equal(screen.disposed, false);
  assert.equal(f.query(), "transcript"); assert.deepEqual(f.commands, []);
});

test("equal run IDs in different workspaces do not share terminal/search state", async (t) => {
  const f = await fixture(); t.after(f.close);
  const screen = f.screen(); await f.search("previous");
  await f.switchWorkspace(b);
  assert.notEqual(f.screen(), screen); assert.equal(screen.disposed, true); assert.equal(f.searches().length, 0);
  await f.openSearch(); assert.equal(f.query(), ""); assert.deepEqual(f.commands, []);
});

test("a rejected replacement preserves the original terminal, query and error", async (t) => {
  const f = await fixture({ failStart: true }); t.after(f.close);
  const screen = f.screen(); await f.search("previous"); await f.start();
  assert.equal(f.screen(), screen); assert.equal(screen.disposed, false); assert.equal(f.query(), "previous");
  assert.equal(f.hasText("fixture start rejected"), true); assert.equal(f.commands.length, 1);
});

test("completed empty output with an actual run identity still owns a searchable surface", async (t) => {
  const f = await fixture({ empty: true }); t.after(f.close);
  assert.equal(f.screens.length, 1); await f.openSearch(); assert.equal(f.query(), "");
  const screen = f.screen(); await f.refresh(); assert.equal(f.screen(), screen); assert.equal(f.searches().length, 1);
});

test("legacy output without a run ID retains its stable fallback surface on refresh", async (t) => {
  const f = await fixture({ legacy: true }); t.after(f.close);
  const screen = f.screen(); await f.search("previous"); await f.refresh();
  assert.equal(f.screen(), screen); assert.equal(screen.disposed, false); assert.equal(f.query(), "previous");
});
