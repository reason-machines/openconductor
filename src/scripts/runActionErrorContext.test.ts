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
type Pending = { workspaceId: string; reject: (message: string) => void };
type Action = "start" | "stop" | "pick";
const a: Props["workspace"] = { id: "run-action-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "run-action-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "run-action-repo", name: "Run action context", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture(action: Action, completeStop = false) {
  const commands: Command[] = [];
  const pending: Pending[] = [];
  const liveTasks = new Map([[a.id, "dev"], [b.id, "dev"]]);
  const modules = new Map<string, { exports: SourceExports }>();
  let currentWorkspace = a;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: ["dev", "test"].map((id) => ({ id, label: id === "dev" ? "Dev" : "Test", command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" })),
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return {
        runs: action === "stop" && args.workspaceId === a.id ? [{ workspaceId: a.id, scriptId: "dev", state: "running", exit: null }] : [], history: [],
      };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return "";
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_start":
      case "run_script_stop": {
        commands.push({ name, args });
        const workspace = args.workspace;
        const workspaceId = name === "run_script_stop" ? args.workspaceId
          : typeof workspace === "object" && workspace !== null && "workspaceId" in workspace ? workspace.workspaceId : null;
        assert.equal(typeof workspaceId, "string", "the command carries its actual workspace identity");
        if (name === "run_script_stop" && completeStop) {
          const liveTask = liveTasks.get(String(workspaceId));
          const matches = liveTask !== undefined && (args.scriptId === null || args.scriptId === liveTask);
          if (matches) liveTasks.delete(String(workspaceId));
          return matches;
        }
        return new Promise<unknown>((_resolve, reject) => { pending.push({ workspaceId: String(workspaceId), reject }); });
      }
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in Run action context regression"); } },
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
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({}) }); });
  const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
  return {
    commands,
    liveTasks,
    errors: () => renderer.root.findAll((node) => node.props.className === "scripts-error").map(text).join("\n"),
    async issue() {
      if (action === "pick") {
        const controls = renderer.root.findAll((node) => typeof node.props.onPick === "function" && Array.isArray(node.props.tasks));
        assert.equal(controls.length, 1, "one real mounted RunSplitButton task-picker callback");
        const onPick = controls[0].props.onPick;
        if (typeof onPick !== "function") assert.fail("task picker has no handler");
        await act(async () => { onPick("test"); });
      } else {
        const label = action === "stop" && currentWorkspace.id === a.id ? "Stop Dev" : "Run Dev";
        const buttons = renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label);
        assert.equal(buttons.length, 1, `one real ${label} button`);
        assert.equal(buttons[0].props.disabled, false, `${label} is enabled`);
        const onClick = buttons[0].props.onClick;
        if (typeof onClick !== "function") assert.fail("Run button has no handler");
        await act(async () => { onClick(); });
      }
    },
    async reject(workspaceId: string, message: string) {
      const index = pending.findIndex((request) => request.workspaceId === workspaceId);
      assert.notEqual(index, -1, "a production handler owns the deferred script command");
      const [request] = pending.splice(index, 1);
      await act(async () => { request.reject(message); });
    },
    async switchWorkspace(workspace: Props["workspace"]) {
      currentWorkspace = workspace;
      await act(async () => { renderer.update(panel()); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

for (const action of ["start", "stop", "pick"] as const) {
  test(`actual Run ${action} does not publish A's late error in B`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    assert.equal(f.commands.length, 0, "restoring the panel issues no script command");
    await f.issue();
    await f.switchWorkspace(b);
    await f.reject(a.id, `A ${action} failure`);
    assert.equal(f.errors(), "", "a Run command error belongs to its issuing workspace");
  });

  test(`actual Run ${action} preserves B's own error when an older A command rejects`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    await f.issue();
    await f.switchWorkspace(b);
    await f.issue();
    await f.reject(b.id, "current B failure");
    assert.equal(f.errors(), "current B failure");
    await f.reject(a.id, `obsolete A ${action} failure`);
    assert.equal(f.errors(), "current B failure", "an obsolete workspace cannot overwrite the visible workspace's error");
  });

  test(`actual Run ${action} keeps same-workspace errors and exact command identity`, async (t) => {
    const f = await fixture(action);
    t.after(f.close);
    await f.issue();
    assert.equal(f.commands.length, 1);
    assert.deepEqual(f.commands[0], action === "stop"
      ? { name: "run_script_stop", args: { workspaceId: a.id, scriptId: "dev" } }
      : { name: "run_script_start", args: { workspace: { workspaceId: a.id, repositoryId: repo.id, repoRoot: repo.path, workspacePath: a.path, workspaceName: a.name, defaultBranch: repo.defaultBranch, targetBranch: null }, scriptId: action === "pick" ? "test" : "dev" } });
    await f.reject(a.id, `visible ${action} failure`);
    assert.equal(f.errors(), `visible ${action} failure`);
  });
}

test("actual Stop Dev preserves a replacement Test behind an unrefreshed status snapshot", async (t) => {
  const f = await fixture("stop", true);
  t.after(f.close);
  f.liveTasks.set(a.id, "test");
  await f.issue();
  assert.equal(f.liveTasks.get(a.id), "test", "Stop Dev must not stop the replacement Test task");
  assert.deepEqual(f.commands, [{ name: "run_script_stop", args: { workspaceId: a.id, scriptId: "dev" } }]);
});

test("actual Stop Dev still stops Dev and preserves another workspace", async (t) => {
  const f = await fixture("stop", true);
  t.after(f.close);
  await f.issue();
  assert.equal(f.liveTasks.has(a.id), false, "the displayed Dev task is stopped");
  assert.equal(f.liveTasks.get(b.id), "dev", "another workspace is untouched");
});
