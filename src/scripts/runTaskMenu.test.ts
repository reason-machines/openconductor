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
type Node = {
  type: unknown;
  props: Record<string, unknown>;
  children: (Node | string)[];
  findAll: (predicate: (node: Node) => boolean) => Node[];
};
type Renderer = { root: Node; unmount: () => void };
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
const workspace: ComponentProps<typeof ScriptsPanel>["workspace"] = {
  id: "run-menu-workspace", name: "Run menu", branch: "main", status: "idle",
  diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/workspace",
};
const repo: ComponentProps<typeof ScriptsPanel>["repo"] = {
  id: "run-menu-repo", name: "Run menu", path: "/fixture/repo", defaultBranch: "main", workspaces: [workspace],
};
const expectedRef = {
  workspaceId: workspace.id, repositoryId: repo.id, repoRoot: repo.path,
  workspacePath: workspace.path, workspaceName: workspace.name, defaultBranch: "main", targetBranch: null,
};
type Command = { name: string; args: Record<string, unknown> };
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel };

async function fixture(options: { runs?: RunStatus[]; idleAfterStart?: boolean; startError?: string } = {}) {
  const commands: Command[] = [];
  let runs = options.runs ?? [];
  let spotlightWorkspaceId: string | null = null;
  let shown = 0;
  let configured = 0;
  const modules = new Map<string, { exports: SourceExports }>();
  const script = (id: string, label: string, isDefault: boolean) => ({
    id, label, command: `fixture-${id}`, args: [], cwd: null, default: isDefault,
    icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared",
  });
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "nonconcurrent", autoRunAfterSetup: false,
        run: [script("dev", "Dev", true), script("test", "Test", false)], managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs, history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return null;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: true, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: spotlightWorkspaceId !== null, workspaceId: spotlightWorkspaceId };
      case "run_script_start":
        commands.push({ name, args });
        if (options.startError) throw new Error(options.startError);
        if (!options.idleAfterStart) runs = [{ workspaceId: workspace.id, scriptId: String(args.scriptId), state: "running", exit: null }];
        return args.scriptId;
      case "run_script_stop":
        commands.push({ name, args });
        runs = [];
        return true;
      case "spotlight_start":
        commands.push({ name, args });
        spotlightWorkspaceId = workspace.id;
        return true;
      case "spotlight_stop":
        commands.push({ name, args });
        spotlightWorkspaceId = null;
        return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const passChildren = ({ children }: { children: ReactNode }) => children;
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser navigation in menu regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/PreviewOpenButton": { PreviewOpenButton: inert },
    "src/components/ScriptOutput": { ScriptOutput: ({ output }: { output: string }) => React.createElement("pre", null, output) },
    "src/components/ui/Tooltip": { Tooltip: passChildren, ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert },
    "src/components/PopoverMenu": {
      PopoverMenu: ({ items, onClose }: { items: { label: string; onSelect: () => void }[]; onClose: () => void }) =>
        React.createElement("div", { role: "menu" }, items.map((item) => React.createElement("button", {
          key: item.label, role: "menuitem", onClick: () => { item.onSelect(); onClose(); },
        }, item.label))),
    },
  };
  const sources = new Set([
    "src/components/ScriptsPanel", "src/components/RunSplitButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/preview", "src/scripts/runTab",
    "src/spotlight/testingApi", "src/spotlight/testing",
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
  let renderer: Renderer;
  await act(async () => {
    renderer = create(React.createElement(Panel, {
      repo, workspace, tab: "run", active: true, actionsSlot: {} as HTMLElement,
      onShowRun: () => { shown++; }, onAddRunScript: () => { configured++; },
    }), { createNodeMock: () => ({ getBoundingClientRect: () => ({ right: 200, bottom: 40 }) }) });
  });
  async function click(predicate: (node: Node) => boolean) {
    const matches = renderer.root.findAll((node) => node.type === "button" && predicate(node));
    assert.equal(matches.length, 1, "one matching real component button");
    const onClick = matches[0].props.onClick;
    assert.equal(typeof onClick, "function");
    await act(async () => { (onClick as () => void)(); });
  }
  return {
    commands,
    shown: () => shown,
    configured: () => configured,
    async menu(label: string) {
      await click((node) => node.props["aria-label"] === "Select task");
      await click((node) => node.props.role === "menuitem" && node.children.join("") === label);
    },
    primary: (label: string) => click((node) => node.props["aria-label"] === label),
    errors: () => renderer.root.findAll((node) => node.props.className === "scripts-error").map((node) => node.children.join("")),
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("actual Run menu starts nondefault Test once while Dev is shown", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.menu("Test");
  assert.deepEqual(f.commands, [{ name: "run_script_start", args: { workspace: expectedRef, scriptId: "test" } }]);
  assert.equal(f.shown(), 1);
  assert.equal(f.configured(), 0);
});

test("actual Run menu switches tasks without starting the previously shown task", async (t) => {
  const f = await fixture({ idleAfterStart: true });
  t.after(f.close);
  await f.menu("Test");
  await f.menu("Dev");
  assert.deepEqual(f.commands, [
    { name: "run_script_start", args: { workspace: expectedRef, scriptId: "test" } },
    { name: "run_script_start", args: { workspace: expectedRef, scriptId: "dev" } },
  ]);
  assert.equal(f.shown(), 2);
});

test("actual Run menu starts Spotlight through Spotlight IPC, not the shown script", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.menu("Spotlight");
  assert.deepEqual(f.commands, [{ name: "spotlight_start", args: {
    repoId: repo.id, workspaceId: workspace.id, workspacePath: workspace.path, repoRoot: repo.path,
  } }]);
  assert.equal(f.shown(), 1);
});

test("actual Run menu Configure opens settings without starting a task", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.menu("Configure");
  assert.deepEqual(f.commands, []);
  assert.equal(f.configured(), 1);
  assert.equal(f.shown(), 0);
});

test("actual primary Run retains its command and Stop targets the displayed task", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.primary("Run Dev");
  await f.primary("Stop Dev");
  assert.deepEqual(f.commands, [
    { name: "run_script_start", args: { workspace: expectedRef, scriptId: "dev" } },
    { name: "run_script_stop", args: { workspaceId: workspace.id, scriptId: "dev" } },
  ]);
});

test("actual primary Run uses the explicit task last picked in the menu", async (t) => {
  const f = await fixture({ idleAfterStart: true });
  t.after(f.close);
  await f.menu("Test");
  await f.primary("Run Test");
  assert.deepEqual(f.commands, [
    { name: "run_script_start", args: { workspace: expectedRef, scriptId: "test" } },
    { name: "run_script_start", args: { workspace: expectedRef, scriptId: "test" } },
  ]);
});

test("actual primary Spotlight Stop and Start retain their commands after a menu pick", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.menu("Spotlight");
  await f.primary("Stop Spotlight");
  await f.primary("Start spotlight");
  assert.deepEqual(f.commands, [
    { name: "spotlight_start", args: { repoId: repo.id, workspaceId: workspace.id, workspacePath: workspace.path, repoRoot: repo.path } },
    { name: "spotlight_stop", args: { repoRoot: repo.path } },
    { name: "spotlight_start", args: { repoId: repo.id, workspaceId: workspace.id, workspacePath: workspace.path, repoRoot: repo.path } },
  ]);
});

test("actual Run menu surfaces a rejected start through the existing panel error", async (t) => {
  const f = await fixture({ startError: "fixture start refused" });
  t.after(f.close);
  await f.menu("Test");
  assert.deepEqual(f.commands, [{ name: "run_script_start", args: { workspace: expectedRef, scriptId: "test" } }]);
  assert.deepEqual(f.errors(), ["fixture start refused"]);
});
