import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { ScriptsConfig } from "./model";

const deps = createRequire(resolve("package.json"));
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
type Read = { workspaceId: string; resolve: (config: ScriptsConfig) => void; reject: (message: string) => void; settled: boolean };
const a: Props["workspace"] = { id: "config-context-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/repo-a/worktree" };
const b: Props["workspace"] = { ...a, id: "config-context-b", name: "B", path: "/fixture/repo-b/worktree" };
const repoA: Props["repo"] = { id: "config-repo-a", name: "Repo A", path: "/fixture/repo-a", defaultBranch: "main", workspaces: [a] };
const repoB: Props["repo"] = { ...repoA, id: "config-repo-b", name: "Repo B", path: "/fixture/repo-b", workspaces: [b] };
function config(label: string): ScriptsConfig {
  return {
    setup: "fixture-setup", setupLayer: "repo_shared", archive: null, runMode: "concurrent", autoRunAfterSetup: false,
    run: [{ id: label, label, command: `fixture-${label}`, args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }],
    managedKeys: [], warnings: [],
  };
}

async function fixture(tab: Props["tab"] = "run") {
  const commands: Command[] = [];
  const reads: Read[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  let currentWorkspace = a;
  let currentRepo = repoA;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    commands.push({ name, args });
    switch (name) {
      case "scripts_config": {
        const workspace = args.workspace;
        assert.ok(typeof workspace === "object" && workspace !== null && "workspaceId" in workspace && typeof workspace.workspaceId === "string");
        const workspaceId = workspace.workspaceId;
        return new Promise<ScriptsConfig>((resolve, reject) => { reads.push({ workspaceId, resolve, reject, settled: false }); });
      }
      case "run_script_status": return { runs: [], history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return "";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in config context regression"); } },
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
    repo: currentRepo, workspace: currentWorkspace, tab, active: tab === "run", actionsSlot: {} as HTMLElement,
    onShowRun: inert, onAddRunScript: inert,
  });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({}) }); });
  const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
  function read(index: number) {
    const request = reads[index];
    assert.ok(request && !request.settled, "the production scriptsConfig request is pending");
    request.settled = true;
    return request;
  }
  return {
    configCommands: () => commands.filter((command) => command.name === "scripts_config"),
    errors: () => renderer.root.findAll((node) => node.props.className === "scripts-error").map(text).join("\n"),
    setupLoadFailed: () => renderer.root.findAll((node) => node.type === "p" && text(node) === "Couldn't load setup script settings").length > 0,
    loading: () => renderer.root.findAll((node) => node.props["aria-busy"] === true || node.props["aria-busy"] === "true").length > 0,
    taskLabels: () => {
      const controls = renderer.root.findAll((node) => typeof node.props.onPick === "function" && Array.isArray(node.props.tasks));
      assert.ok(controls.length <= 1, "at most one mounted RunSplitButton");
      const tasks = controls[0]?.props.tasks;
      if (!Array.isArray(tasks)) return [];
      return tasks.map((task: unknown) => {
        assert.ok(typeof task === "object" && task !== null && "label" in task && typeof task.label === "string");
        return task.label;
      });
    },
    async settle(index: number, label: string) {
      const request = read(index);
      await act(async () => { request.resolve(config(label)); });
    },
    async reject(index: number, message: string) {
      const request = read(index);
      await act(async () => { request.reject(message); });
    },
    async switchTo(workspace: Props["workspace"], repo: Props["repo"]) {
      currentWorkspace = workspace;
      currentRepo = repo;
      await act(async () => { renderer.update(panel()); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

for (const tab of ["run", "setup"] as const) {
  test(`actual ${tab} config ignores repo A's late rejection while repo B loads`, async (t) => {
    const f = await fixture(tab);
    t.after(f.close);
    await f.switchTo(b, repoB);
    assert.equal(f.loading(), true);
    await f.reject(0, "obsolete repo A config failure");
    assert.equal(f.errors(), "", "the current repo must not display the previous repo's load error");
    assert.equal(f.setupLoadFailed(), false);
    assert.equal(f.loading(), true, "B must keep its own pending-config view");
    await f.settle(1, "B task");
    assert.deepEqual(f.taskLabels(), ["B task"]);
  });

  test(`actual ${tab} config preserves repo B's own failure when A rejects last`, async (t) => {
    const f = await fixture(tab);
    t.after(f.close);
    await f.switchTo(b, repoB);
    await f.reject(1, "current repo B config failure");
    if (tab === "run") assert.equal(f.errors(), "current repo B config failure");
    else assert.equal(f.setupLoadFailed(), true);
    await f.reject(0, "obsolete repo A config failure");
    if (tab === "run") assert.equal(f.errors(), "current repo B config failure");
    else assert.equal(f.setupLoadFailed(), true);
  });
}

test("actual Run config keeps B's successful tasks when A rejects late", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchTo(b, repoB);
  await f.settle(1, "B task");
  assert.deepEqual(f.taskLabels(), ["B task"]);
  await f.reject(0, "obsolete repo A config failure");
  assert.equal(f.errors(), "");
  assert.deepEqual(f.taskLabels(), ["B task"]);
});

test("actual Run config ignores an old A failure after returning from B to A", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchTo(b, repoB);
  await f.switchTo(a, repoA);
  await f.settle(2, "current A task");
  await f.reject(0, "old A config failure");
  assert.equal(f.errors(), "", "workspace identity alone cannot admit an obsolete config request");
  assert.deepEqual(f.taskLabels(), ["current A task"]);
});

test("actual Run config preserves successful result keys and cached task lists", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchTo(b, repoB);
  await f.settle(1, "B task");
  await f.settle(0, "A task");
  assert.deepEqual(f.taskLabels(), ["B task"], "a successful A response cannot replace B's task list");
  await f.switchTo(a, repoA);
  assert.deepEqual(f.taskLabels(), ["A task"], "the previous workspace retains its successful cache entry");
  await f.settle(2, "refreshed A task");
  assert.deepEqual(f.taskLabels(), ["refreshed A task"]);
});

test("actual config read preserves current-workspace errors and exact IPC identity", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.deepEqual(f.configCommands(), [{ name: "scripts_config", args: { workspace: {
    workspaceId: a.id, repositoryId: repoA.id, repoRoot: repoA.path, workspacePath: a.path,
    workspaceName: a.name, defaultBranch: repoA.defaultBranch, targetBranch: null,
  } } }]);
  await f.reject(0, "current repo A config failure");
  assert.equal(f.errors(), "current repo A config failure");
  assert.equal(f.configCommands().length, 1, "reporting an error does not issue a new config request");
});
