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
type Pairs = [string, string][];
type Read = { resolve: (pairs: Pairs) => void; reject: (message: string) => void; settled: boolean };
const a: Props["workspace"] = { id: "preview-context-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "preview-context-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "preview-context-repo", name: "Preview context", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };
const template = "http://localhost:$CONDUCTOR_PORT/$CONDUCTOR_WORKSPACE_NAME";
const pairs = (name: string, port: string): Pairs => [["CONDUCTOR_WORKSPACE_NAME", name], ["CONDUCTOR_PORT", port]];

async function fixture() {
  const commands: Command[] = [];
  const reads: Read[] = [];
  const opened: string[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  let currentWorkspace = a;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    commands.push({ name, args });
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: [{ id: "dev", label: "Dev", command: "fixture-dev", args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }],
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: [{ workspaceId: String(args.workspaceId), scriptId: "dev", state: "running", exit: null }], history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return "dev running\n";
      case "run_script_preview_env": return new Promise<Pairs>((resolve, reject) => { reads.push({ resolve, reject, settled: false }); });
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: async (url: string) => { opened.push(url); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/settings/useRepoSettings": { useRepoSettings: () => ({ previewUrls: { value: [{ name: "Local", url: template }] } }) },
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
  function openButton() {
    const matches = renderer.root.findAll((node) => node.type === "button" && typeof node.props["aria-label"] === "string" && node.props["aria-label"].startsWith("Open "));
    assert.equal(matches.length, 1, "one actual mounted Open button");
    return matches[0];
  }
  return {
    opened,
    envCommands: () => commands.filter((command) => command.name === "run_script_preview_env"),
    openLabel: () => openButton().props["aria-label"],
    async open() {
      const onClick = openButton().props.onClick;
      if (typeof onClick !== "function") assert.fail("Open button has no handler");
      await act(async () => { onClick(); });
    },
    async settle(index: number, values: Pairs) {
      const read = reads[index];
      assert.ok(read && !read.settled, "the real preview environment request is pending");
      read.settled = true;
      await act(async () => { read.resolve(values); });
    },
    async reject(index: number) {
      const read = reads[index];
      assert.ok(read && !read.settled, "the real preview environment request is pending");
      read.settled = true;
      await act(async () => { read.reject("fixture preview environment failure"); });
    },
    async switchWorkspace(workspace: Props["workspace"]) {
      currentWorkspace = workspace;
      await act(async () => { renderer.update(panel()); });
    },
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("actual Open button does not use A's late preview variables while B is loading", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchWorkspace(b);
  await f.settle(0, pairs("A", "51001"));
  assert.equal(f.openLabel(), `Open ${template}`, "A's late environment must not supply B's URL variables");
  await f.open();
  assert.deepEqual(f.opened, [template]);
  await f.settle(1, pairs("B", "51002"));
  assert.equal(f.openLabel(), "Open http://localhost:51002/B");
});

test("actual Open handler retains B's preview URL when A resolves last", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchWorkspace(b);
  await f.settle(1, pairs("B", "51002"));
  assert.equal(f.openLabel(), "Open http://localhost:51002/B");
  await f.settle(0, pairs("A", "51001"));
  assert.equal(f.openLabel(), "Open http://localhost:51002/B", "an obsolete request must not replace the current workspace's preview URL");
  await f.open();
  assert.deepEqual(f.opened, ["http://localhost:51002/B"]);
});

test("actual Open handler ignores an older A request after returning from B to A", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchWorkspace(b);
  await f.switchWorkspace(a);
  await f.settle(2, pairs("A-current", "51003"));
  await f.settle(0, pairs("A-old", "51001"));
  assert.equal(f.openLabel(), "Open http://localhost:51003/A-current", "workspace identity alone cannot admit an obsolete request");
  await f.open();
  assert.deepEqual(f.opened, ["http://localhost:51003/A-current"]);
  await f.settle(1, pairs("B", "51002"));
  assert.equal(f.openLabel(), "Open http://localhost:51003/A-current");
});

test("actual Open handler keeps current preview variables when an obsolete read rejects", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.switchWorkspace(b);
  await f.settle(1, pairs("B", "51002"));
  await f.reject(0);
  assert.equal(f.openLabel(), "Open http://localhost:51002/B");
  await f.open();
  assert.deepEqual(f.opened, ["http://localhost:51002/B"]);
});

test("actual Open handler preserves same-workspace expansion and exact preview IPC identity", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.deepEqual(f.envCommands(), [{ name: "run_script_preview_env", args: { workspace: {
    workspaceId: a.id, repositoryId: repo.id, repoRoot: repo.path, workspacePath: a.path,
    workspaceName: a.name, defaultBranch: repo.defaultBranch, targetBranch: null,
  } } }]);
  await f.settle(0, pairs("A", "51001"));
  assert.equal(f.openLabel(), "Open http://localhost:51001/A");
  await f.open();
  assert.deepEqual(f.opened, ["http://localhost:51001/A"]);
  assert.equal(f.envCommands().length, 1, "opening a URL does not refetch or start a process");
});
