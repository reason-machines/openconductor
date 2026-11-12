import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { ScriptOutput } from "../components/ScriptOutput";
import type { RunState, RunStatus } from "./model.ts";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Renderer = {
  unmount: () => void;
  root: { findByProps: (props: Record<string, unknown>) => { props: { onClick: () => void } } };
};
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof ScriptsPanel>;
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel; ScriptOutput?: typeof ScriptOutput };
type WireListener = (event: { payload: unknown }) => void;
const workspace: Props["workspace"] = { id: "cursor-workspace", name: "Cursor", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/cursor" };
const repo: Props["repo"] = { id: "cursor-repo", name: "Cursor", path: "/fixture/repo", defaultBranch: "main", workspaces: [workspace] };

async function fixture(initial: RunState = "running", tab: Props["tab"] = "run", standalone = false) {
  const screens: Screen[] = [];
  const observers: Observer[] = [];
  const listeners = new Set<WireListener>();
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
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() {}
    write(data: string) { this.output += data; }
    getSelection() { return ""; }
    focus() { this.focusCalls++; }
    onData() { return { dispose() {} }; }
    dispose() { this.disposed = true; }
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
        run: [{ id: "dev", label: "dev", command: "fixture-dev", args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }],
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: [{ workspaceId: workspace.id, scriptId: "dev", runId: "cursor-run", state, exit: null } satisfies RunStatus], history: ["dev"] };
      case "setup_script_status": return { state: "running", log: "setup output\n", last: null };
      case "run_script_output": return "script output\n";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_resize": return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in cursor option regression"); } },
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
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No link warning in outputCursor regression"); } };
      if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
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
      console, document: { documentElement, activeElement: null }, getComputedStyle: () => ({ getPropertyValue: (name: string) => colors[name] ?? "" }),
      ResizeObserver: Observer, MutationObserver: Observer,
    }, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptsPanel: Panel } = load("src/components/ScriptsPanel");
  const { ScriptOutput: Output } = load("src/components/ScriptOutput");
  assert.ok(Panel);
  assert.ok(Output);
  const host = Object.assign(new EventTarget(), { clientWidth: 800, clientHeight: 400, contains: () => false });
  const element = standalone
    ? React.createElement(Output, { output: "retained default output", onInput: async () => {} })
    : React.createElement(Panel, { repo, workspace, tab, active: true, onShowRun: inert, onAddRunScript: inert });
  let renderer: Renderer;
  await act(async () => { renderer = create(element, { createNodeMock: () => host }); });
  function screen() {
    const current = screens.at(-1);
    assert.ok(current);
    return current;
  }
  function cursorTheme() {
    const theme = screen().options.theme;
    assert.ok(theme !== null && typeof theme === "object");
    return { cursor: Reflect.get(theme, "cursor"), cursorAccent: Reflect.get(theme, "cursorAccent") };
  }
  return {
    screen, screens, colors, cursorTheme,
    async setState(next: RunState) {
      state = next;
      await act(async () => { for (const listener of [...listeners]) listener({ payload: { type: "runFinished", workspaceId: workspace.id } }); });
    },
    async focus() { await act(async () => { renderer.root.findByProps({ className: "script-output" }).props.onClick(); }); },
    async palette() {
      colors["--text"] = "fixture-foreground-dark";
      colors["--bg"] = "fixture-background-dark";
      await act(async () => { for (const observer of observers) if (observer.connected && observer.target === documentElement) observer.callback(); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

function foreground(f: Awaited<ReturnType<typeof fixture>>) {
  assert.deepEqual(f.cursorTheme(), { cursor: f.colors["--text"], cursorAccent: f.colors["--bg"] });
}

test("running Run output supplies foreground cursor colors to xterm", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal(f.screen().options.disableStdin, false, "actual Run caller enables input");
  foreground(f);
});

test("Run output requests cursor blinking at the terminal constructor boundary", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal(f.screen().options.cursorBlink, true);
});

test("a stopped Run retains its cursor colors without enabling stdin", async (t) => {
  const f = await fixture("stopped");
  t.after(f.close);
  assert.equal(f.screen().options.disableStdin, true);
  foreground(f);
});

test("Run cursor policy survives input disable on the same terminal", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const screen = f.screen();
  const output = screen.output;
  await f.setState("stopped");
  assert.equal(f.screen(), screen, "the retained output terminal is not recreated");
  assert.equal(screen.output, output, "stopping does not reset or replace accumulated output");
  assert.equal(screen.options.disableStdin, true);
  foreground(f);
});

test("the output click delegates focus without replacing Run cursor policy", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.focus();
  assert.equal(f.screen().focusCalls, 1, "only the public focus call is observed, not native focus or rendering");
  foreground(f);
});

test("palette changes refresh Run cursor and accent from current theme tokens", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.palette();
  foreground(f);
});

test("Setup output remains read-only with a transparent cursor after a palette change", async (t) => {
  const f = await fixture("running", "setup");
  t.after(f.close);
  await f.palette();
  assert.equal(f.screen().options.disableStdin, true);
  assert.equal(f.cursorTheme().cursor, f.colors["--terminal-transparent"]);
});

test("default standalone output with input preserves transparent cursor configuration", async (t) => {
  const f = await fixture("running", "run", true);
  t.after(f.close);
  await f.palette();
  assert.equal(f.screen().options.disableStdin, false, "the existing default control is independent of stdin availability");
  assert.equal(f.cursorTheme().cursor, f.colors["--terminal-transparent"]);
});
