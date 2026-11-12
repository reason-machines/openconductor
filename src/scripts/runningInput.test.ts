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
type Write = { workspaceId: string; scriptId: string; runId: string; data: string };
const a: Props["workspace"] = { id: "input-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "input-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "input-repo", name: "Input", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture(initial: RunState = "running", tab: Props["tab"] = "run", identified = true) {
  const writes: Write[] = [];
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
    constructor(options: Record<string, unknown>) { this.options = options; screens.push(this); }
    loadAddon() {}
    open() {}
    write() {}
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
      case "run_script_write": {
        if (typeof args.workspaceId !== "string" || typeof args.scriptId !== "string" || typeof args.runId !== "string" || typeof args.data !== "string") assert.fail("typed, generation-qualified input payload");
        writes.push({ workspaceId: args.workspaceId, scriptId: args.scriptId, runId: args.runId, data: args.data });
        return true;
      }
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in input regression"); } },
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
  class Observer { observe() {} disconnect() {} }
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
      if (name === "@tauri-apps/plugin-dialog") return { confirm: () => { throw new Error("No link warning in runningInput regression"); } };
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
    writes, screens,
    type: (data: string) => act(async () => { screens.at(-1)?.type(data); }),
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

test("running terminal input reaches the real panel/API route with exact bytes and run identity", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const inputs = ["answer\r", "\u001b[A", "\u0003", "é漢字\r", "\u001b[200~multi\nline\u001b[201~"];
  for (const data of inputs) await f.type(data);
  assert.deepEqual(f.writes, inputs.map((data) => ({ workspaceId: a.id, scriptId: "dev", runId: "run-1", data })), "typed/pasted bytes must reach the identified live script, not just its transcript");
  assert.equal(f.screens.at(-1)?.options.disableStdin, false);
});

test("retained stopped script output remains read-only", async (t) => {
  const f = await fixture("stopped");
  t.after(f.close);
  await f.type("must not run\r");
  assert.deepEqual(f.writes, []);
  assert.equal(f.screens.at(-1)?.options.disableStdin, true);
});

test("input follows running/stopping/rerun without remounting or reusing the old generation", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const screen = f.screens.at(-1);
  await f.type("first\r");
  await f.setState("stopping");
  await f.type("not sent\r");
  await f.setState("stopped");
  await f.type("also not sent\r");
  await f.setState("running", "run-2");
  await f.type("second\r");
  assert.equal(f.screens.at(-1), screen, "status changes preserve the terminal buffer");
  assert.deepEqual(f.writes.map(({ runId, data }) => ({ runId, data })), [{ runId: "run-1", data: "first\r" }, { runId: "run-2", data: "second\r" }]);
  assert.equal(screen?.inputs.size, 1, "one current input subscription after a rerun");
});

test("input targets the displayed workspace/script, never the disposed previous terminal", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const old = f.screens.at(-1);
  await f.show(b, "test");
  await f.type("B input\r");
  old?.type("A stale input\r");
  assert.deepEqual(f.writes, [{ workspaceId: b.id, scriptId: "test", runId: "run-1", data: "B input\r" }]);
  assert.equal(old?.inputs.size, 0, "old terminal input subscription is disposed");
});

test("unmount removes the input subscriber", async () => {
  const f = await fixture();
  const old = f.screens.at(-1);
  await f.close();
  assert.equal(old?.inputs.size, 0);
  old?.type("late\r");
  assert.deepEqual(f.writes, []);
});

test("setup output is not routed to a run-script process", async (t) => {
  const f = await fixture("running", "setup");
  t.after(f.close);
  await f.type("not run input\r");
  assert.deepEqual(f.writes, []);
  assert.equal(f.screens.at(-1)?.options.disableStdin, true);
});

test("running status without a live run identity cannot enable input", async (t) => {
  const f = await fixture("running", "run", false);
  t.after(f.close);
  await f.type("unidentified\r");
  assert.deepEqual(f.writes, []);
  assert.equal(f.screens.at(-1)?.options.disableStdin, true);
});
