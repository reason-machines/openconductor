import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
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
const a: Props["workspace"] = { id: "wait-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "wait-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "wait-repo", name: "Queued run", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture({ completed = false, legacyOutput = false, failStart = false } = {}) {
  const commands: { name: string; args: Record<string, unknown> }[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  const runs = new Map<string, RunStatus[]>([[a.id, completed ? [{ workspaceId: a.id, scriptId: "dev", runId: "completed-a", state: "stopped", exit: [0, null] }] : []], [b.id, [{ workspaceId: b.id, scriptId: "dev", runId: "completed-b", state: "stopped", exit: [0, null] }]]]);
  let workspace = a;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = String(args.workspaceId ?? (args.workspace as { workspaceId?: string } | undefined)?.workspaceId);
    switch (name) {
      case "scripts_config": return {
        setup: "fixture-setup", setupLayer: "repo_shared", archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: [{ id: "dev", label: "Dev", command: "fixture-dev", args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }], managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: runs.get(workspaceId) ?? [], history: ["dev"] };
      case "setup_script_status": return { state: "running", log: null, last: null };
      case "run_script_output": return workspaceId === b.id ? "B retained transcript\n" : legacyOutput ? "legacy transcript\n" : null;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_start":
        commands.push({ name, args });
        if (failStart) throw new Error("fixture start rejected");
        runs.set(workspaceId, [{ workspaceId, scriptId: "dev", state: "waiting_for_setup", exit: null }]);
        return "dev";
      case "run_script_stop":
        commands.push({ name, args });
        runs.set(workspaceId, (runs.get(workspaceId) ?? []).map((run) => ({ ...run, state: "stopped" })));
        return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in queued-run regression"); } },
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
      fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
    });
    const require = (name: string): unknown => {
      if (name === "react" || name === "react/jsx-runtime") return deps(name);
      if (name === "react-dom") return { createPortal: (children: ReactNode) => children };
      if (name === "@tauri-apps/api/core") return { invoke };
      if (name === "@tauri-apps/api/event") return { listen: async () => () => {} };
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
  const panel = () => React.createElement(Panel, { repo, workspace, tab: "run", active: true, actionsSlot: {} as HTMLElement, onShowRun: inert, onAddRunScript: inert });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({ getBoundingClientRect: () => ({ right: 200, bottom: 40 }) }) }); });
  const nodes = (predicate: (node: Node) => boolean) => renderer.root.findAll(predicate);
  return {
    commands,
    idle: () => nodes((node) => node.type === "div" && node.props.className === "scripts-run-idle").length === 1,
    outputs: () => nodes((node) => node.type === "pre").length,
    text: () => nodes((node) => node.type === "pre").map((node) => node.children.join("")).join(""),
    hasText: (text: string) => nodes((node) => node.children.filter((child) => typeof child === "string").join("") === text).length > 0,
    async primary(label: string) {
      const matches = nodes((node) => node.type === "button" && node.props["aria-label"] === label);
      assert.equal(matches.length, 1, `one real ${label} control`);
      assert.equal(matches[0].props.disabled, false);
      const onClick = matches[0].props.onClick;
      assert.equal(typeof onClick, "function");
      await act(async () => { (onClick as () => void)(); });
    },
    async switchWorkspace(next: Props["workspace"]) { workspace = next; await act(async () => { renderer.update(panel()); }); },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("cancelled queued Run returns to its idle start action without an output surface", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.ok(f.idle());
  await f.primary("Run Dev");
  assert.ok(f.hasText("Setting up..."), "waiting must remain visibly pending before cancellation");
  assert.equal(f.outputs(), 0);
  await f.primary("Stop Dev");
  assert.ok(f.idle(), "a stopped queue entry without a run ID is not a completed run");
  assert.ok(f.hasText("Start Dev"));
  assert.equal(f.outputs(), 0, "never-admitted runs must not mount a blank output surface");
  assert.deepEqual(f.commands.map((command) => command.name), ["run_script_start", "run_script_stop"]);
});

test("a completed Run keeps its empty output surface when its run ID exists", async (t) => {
  const f = await fixture({ completed: true });
  t.after(f.close);
  assert.equal(f.idle(), false);
  assert.equal(f.outputs(), 1, "run identity, not nonempty output, keeps a completed run visible");
  assert.equal(f.text(), "");
  assert.deepEqual(f.commands, []);
});

test("cancelled queued Run stays idle after visiting another workspace's completed output", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.primary("Run Dev");
  await f.primary("Stop Dev");
  await f.switchWorkspace(b);
  assert.equal(f.idle(), false);
  assert.equal(f.text(), "B retained transcript\n");
  await f.switchWorkspace(a);
  assert.ok(f.idle(), "the cancelled workspace cannot borrow another workspace's run identity");
  assert.equal(f.outputs(), 0);
  assert.equal(f.commands.length, 2);
});

test("legacy output remains readable without adding a synthetic run identity", async (t) => {
  const f = await fixture({ legacyOutput: true });
  t.after(f.close);
  assert.equal(f.idle(), false);
  assert.equal(f.text(), "legacy transcript\n");
  assert.deepEqual(f.commands, []);
});

test("rejected queue requests preserve the error and idle retry action", async (t) => {
  const f = await fixture({ failStart: true });
  t.after(f.close);
  await f.primary("Run Dev");
  assert.ok(f.hasText("fixture start rejected"));
  assert.ok(f.idle());
  assert.ok(f.hasText("Start Dev"));
  assert.equal(f.outputs(), 0);
  assert.deepEqual(f.commands.map((command) => command.name), ["run_script_start"]);
});
