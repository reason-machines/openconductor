import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";

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
type Command = { name: string; args: Record<string, unknown> };
type Pending = { workspaceId: string; resolve: () => void; reject: (message: string) => void };
const a: Props["workspace"] = { id: "spot-context-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "spot-context-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "spot-context-repo", name: "Spotlight context", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture(action: "start" | "stop" = "start") {
  const commands: Command[] = [];
  const pending: Pending[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  let activeWorkspaceId: string | null = action === "stop" ? a.id : null;
  let currentWorkspace = a;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return { setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false, run: [], managedKeys: [], warnings: [] };
      case "run_script_status": return { runs: [], history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return "";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: true, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: activeWorkspaceId !== null, workspaceId: activeWorkspaceId };
      case "spotlight_start":
      case "spotlight_stop": {
        commands.push({ name, args });
        const workspaceId = name === "spotlight_start" ? String(args.workspaceId) : activeWorkspaceId;
        assert.ok(workspaceId, "the stop command belongs to the active Spotlight session");
        return new Promise<boolean>((resolve, reject) => {
          pending.push({ workspaceId, resolve: () => { activeWorkspaceId = name === "spotlight_start" ? workspaceId : null; resolve(true); }, reject });
        });
      }
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in Spotlight context regression"); } },
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
      if (name === "@tauri-apps/api/event") return { listen: async () => inert };
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
  const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
  const buttons = (label: string) => renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label);
  return {
    commands,
    errors: () => renderer.root.findAll((node) => node.props.className === "scripts-error").map(text).join("\n"),
    enabled: (label: string) => buttons(label).length === 1 && buttons(label)[0].props.disabled === false,
    isPending: () => renderer.root.findAll((node) => node.type === "button" && /^(Starting|Stopping)\.\.\.$/.test(text(node))).length === 1,
    async primary(label: string) {
      const matches = buttons(label);
      assert.equal(matches.length, 1, `one real ${label} button`);
      assert.equal(matches[0].props.disabled, false, `${label} is enabled`);
      const onClick = matches[0].props.onClick;
      if (typeof onClick !== "function") assert.fail("Spotlight button has no handler");
      await act(async () => { onClick(); });
    },
    async pickSpotlight() {
      const controls = renderer.root.findAll((node) => typeof node.props.onPick === "function" && Array.isArray(node.props.tasks));
      assert.equal(controls.length, 1, "one actual mounted task picker callback");
      const onPick = controls[0].props.onPick;
      if (typeof onPick !== "function") assert.fail("Run split button has no task callback");
      await act(async () => { onPick("spotlight"); });
    },
    async settle(workspaceId: string, failure?: string) {
      const index = pending.findIndex((request) => request.workspaceId === workspaceId);
      assert.notEqual(index, -1, "a real Spotlight handler owns the deferred command");
      const [request] = pending.splice(index, 1);
      await act(async () => { if (failure === undefined) request.resolve(); else request.reject(failure); });
    },
    async switchWorkspace(workspace: Props["workspace"]) {
      currentWorkspace = workspace;
      await act(async () => { renderer.update(panel()); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

for (const action of ["start", "stop"] as const) {
  const label = action === "start" ? "Start spotlight" : "Stop Spotlight";
  test(`actual Spotlight panel does not project another workspace's pending ${action}`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    assert.equal(f.commands.length, 0, "restoring the panel never starts or stops Spotlight");
    await f.primary(label);
    assert.ok(f.isPending());
    await f.switchWorkspace(b);
    assert.ok(f.enabled("Start spotlight"), "B can start Spotlight while A's command is unresolved");
    assert.equal(f.isPending(), false, "A's pending action is not B's process state");
    await f.settle(a.id);
  });

  test(`actual Spotlight panel ignores a late ${action} error from a previous workspace`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    await f.primary(label);
    await f.switchWorkspace(b);
    await f.settle(a.id, `A ${action} rejected`);
    assert.equal(f.errors(), "", "a command failure belongs to the workspace that issued it");
    assert.ok(f.enabled("Start spotlight"));
  });

  test(`actual Spotlight panel keeps B's newer request pending when A's ${action} settles`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    await f.primary(label);
    await f.switchWorkspace(b);
    await f.pickSpotlight();
    assert.ok(f.isPending());
    await f.settle(a.id);
    assert.ok(f.isPending(), "an obsolete completion must not clear the newer request");
    await f.settle(b.id);
    assert.equal(f.isPending(), false);
    assert.ok(f.enabled("Stop Spotlight"));
    assert.equal(f.commands.length, 2);
    assert.deepEqual(f.commands[1], { name: "spotlight_start", args: { repoId: repo.id, workspaceId: b.id, workspacePath: b.path, repoRoot: repo.path } });
  });

  test(`actual Spotlight ${action} keeps same-workspace errors and command identity`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    await f.primary(label);
    assert.equal(f.commands.length, 1);
    assert.deepEqual(f.commands[0], action === "start"
      ? { name: "spotlight_start", args: { repoId: repo.id, workspaceId: a.id, workspacePath: a.path, repoRoot: repo.path } }
      : { name: "spotlight_stop", args: { repoRoot: repo.path } });
    assert.ok(f.isPending());
    await f.settle(a.id, `visible ${action} failure`);
    assert.equal(f.errors(), `visible ${action} failure`);
    assert.equal(f.isPending(), false);
    assert.ok(f.enabled(label));
  });
}
