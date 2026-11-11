import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { RunStatus, ScriptsConfig } from "./model.ts";

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
type WireListener = (event: { payload: unknown }) => void;
type Command = { name: string; args: Record<string, unknown> };
const a: Props["workspace"] = { id: "history-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "history-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "history-repo", name: "Run history", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture({ history = ["test"], busy = false, configured = ["dev", "test"] } = {}) {
  const histories = new Map([[a.id, history], [b.id, ["dev"]]]);
  const commands: Command[] = [];
  const listeners = new Set<WireListener>();
  const modules = new Map<string, { exports: SourceExports }>();
  const runs = new Map<string, RunStatus[]>();
  for (const workspace of [a, b]) {
    const snapshots: RunStatus[] = ["dev", "test"].map((scriptId) => ({
      workspaceId: workspace.id, scriptId, state: busy && scriptId === "dev" ? "running" : "stopped", exit: null,
    }));
    runs.set(workspace.id, snapshots);
  }
  let currentWorkspace = a;
  const script = (id: string): ScriptsConfig["run"][number] => ({ id, label: id === "dev" ? "Dev" : "Test", command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" });
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = String(args.workspaceId);
    switch (name) {
      case "scripts_config": return { setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false, run: configured.map(script), managedKeys: [], warnings: [] };
      case "run_script_status": return { runs: runs.get(workspaceId) ?? [], history: histories.get(workspaceId) ?? [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return `${workspaceId}:${String(args.scriptId)} transcript\n`;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_start": commands.push({ name, args }); return String(args.scriptId);
      case "run_script_stop": commands.push({ name, args }); return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in run history regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/ScriptOutput": { ScriptOutput: ({ output }: { output: string }) => React.createElement("pre", null, output) },
    "src/components/ui/Tooltip": { Tooltip: ({ children }: { children: ReactNode }) => children, ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert },
    "src/components/PopoverMenu": { PopoverMenu: inert },
  };
  const sources = new Set([
    "src/components/ScriptsPanel", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/preview", "src/scripts/runTab", "src/spotlight/testingApi", "src/spotlight/testing",
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
    runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  const { ScriptsPanel: Panel } = load("src/components/ScriptsPanel");
  assert.ok(Panel);
  const panel = () => React.createElement(Panel, {
    repo, workspace: currentWorkspace, tab: "run", active: true, actionsSlot: {} as HTMLElement,
    onShowRun: inert, onAddRunScript: inert,
  });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({ getBoundingClientRect: () => ({ right: 200, bottom: 40 }) }) }); });
  const buttons = (label: string) => renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label);
  return {
    commands, histories, runs,
    output: () => renderer.root.findAll((node) => node.type === "pre").map((node) => node.children.join("")).join(""),
    hasButton: (label: string) => buttons(label).length === 1,
    async primary(label: string) {
      const matches = buttons(label);
      assert.equal(matches.length, 1, `one real ${label} button`);
      assert.equal(matches[0].props.disabled, false);
      const onClick = matches[0].props.onClick;
      assert.equal(typeof onClick, "function");
      if (typeof onClick !== "function") assert.fail("Run control has no handler");
      await act(async () => { onClick(); });
    },
    async switchWorkspace(workspace: Props["workspace"]) {
      currentWorkspace = workspace;
      await act(async () => { renderer.update(panel()); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("actual Run panel restores a workspace's nondefault history without starting a task", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.ok(f.hasButton("Run Test"), "Test history outranks the configured Dev default");
  assert.equal(f.output(), "history-a:test transcript\n");
  assert.deepEqual(f.commands, [], "restoring history must not start or stop a task");
});

test("actual Run panel restores each workspace history through A to B to A", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.equal(f.output(), "history-a:test transcript\n");
  await f.switchWorkspace(b);
  assert.ok(f.hasButton("Run Dev"));
  assert.equal(f.output(), "history-b:dev transcript\n");
  await f.switchWorkspace(a);
  assert.ok(f.hasButton("Run Test"));
  assert.equal(f.output(), "history-a:test transcript\n");
  assert.deepEqual(f.commands, []);
});

test("actual Run panel skips deleted history IDs before selecting a configured task", async (t) => {
  const f = await fixture({ history: ["deleted", "test"] });
  t.after(f.close);
  assert.ok(f.hasButton("Run Test"));
  assert.equal(f.output(), "history-a:test transcript\n");
  await f.primary("Run Test");
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].name, "run_script_start");
  assert.equal(f.commands[0].args.scriptId, "test", "the real control never sends the deleted ID");
});

test("actual Run panel falls back to Dev when all historical tasks were removed", async (t) => {
  const f = await fixture({ history: ["deleted", "test"], configured: ["dev"] });
  t.after(f.close);
  assert.ok(f.hasButton("Run Dev"));
  assert.equal(f.commands.length, 0);
  await f.primary("Run Dev");
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].args.scriptId, "dev");
});

test("actual Run panel keeps a busy task projected over an idle historical selection", async (t) => {
  const f = await fixture({ busy: true });
  t.after(f.close);
  assert.ok(f.hasButton("Stop Dev"));
  assert.equal(f.output(), "history-a:dev transcript\n");
  assert.deepEqual(f.commands, []);
});

test("actual Run panel keeps default selection inert when workspace history is empty", async (t) => {
  const f = await fixture({ history: [] });
  t.after(f.close);
  assert.ok(f.hasButton("Run Dev"));
  assert.deepEqual(f.commands, []);
});
