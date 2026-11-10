import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { ScriptsPanel } from "../components/ScriptsPanel";
import type { RunStatus, SetupStatus } from "./model.ts";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[]; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Renderer = { root: Node; unmount: () => void; update: (element: ReactNode) => void };
const { create, act }: {
  create: (element: ReactNode) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof ScriptsPanel>;
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel };
type WireListener = (event: { payload: unknown }) => void;
const a: Props["workspace"] = { id: "setup-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "setup-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "setup-context-repo", name: "Setup context", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };
const idle = (): SetupStatus => ({ state: "idle", log: null, last: null });
const running = (log: string): SetupStatus => ({ state: "running", log, last: null });

async function fixture(initial = running("A transcript\n")) {
  const setup = new Map([[a.id, initial], [b.id, idle()]]);
  const runs = new Map<string, RunStatus[]>([[a.id, []], [b.id, []]]);
  const heldStatuses = new Set<string>();
  const pendingStatuses: { workspaceId: string; resolve: (status: SetupStatus) => void }[] = [];
  const pendingStarts = new Map<string, () => void>();
  const listeners = new Set<WireListener>();
  const modules = new Map<string, { exports: SourceExports }>();
  const observed: { workspaceId: string; state: SetupStatus["state"] }[] = [];
  let currentWorkspace = a;
  let tab: Props["tab"] = "setup";
  const script = (id: string) => ({ id, label: id === "dev" ? "Dev" : "Test", command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" });
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = String(args.workspaceId);
    switch (name) {
      case "scripts_config": return { setup: "fixture-setup", setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false, run: [script("dev"), script("test")], managedKeys: [], warnings: [] };
      case "run_script_status": return { runs: runs.get(workspaceId) ?? [], history: [] };
      case "setup_script_status": {
        if (heldStatuses.has(workspaceId)) return new Promise<SetupStatus>((resolve) => { pendingStatuses.push({ workspaceId, resolve }); });
        return setup.get(workspaceId) ?? idle();
      }
      case "setup_script_start": {
        const ref = args.workspace;
        assert.ok(ref && typeof ref === "object" && "workspaceId" in ref);
        const id = String(ref.workspaceId);
        setup.set(id, running(`${id} started\n`));
        return new Promise<boolean>((resolve) => { pendingStarts.set(id, () => resolve(true)); });
      }
      case "run_script_output": return `${workspaceId} run ${String(args.scriptId)}\n`;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in setup context regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/settings/useRepoSettings": { useRepoSettings: () => null },
    "src/components/ScriptOutput": { ScriptOutput: ({ output }: { output: string }) => React.createElement("pre", null, output) },
    "src/components/ui/Tooltip": { ShortcutHint: inert },
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
  const panel = () => {
    const workspace = currentWorkspace;
    return React.createElement(Panel, {
      repo, workspace, tab, active: true, onShowRun: inert, onAddRunScript: inert,
      onSetupState: (state) => { observed.push({ workspaceId: workspace.id, state }); },
    });
  };
  let renderer: Renderer;
  await act(async () => { renderer = create(panel()); });
  const text = (node: Node | string): string => typeof node === "string" ? node : node.children.map(text).join("");
  const buttons = (label: string) => renderer.root.findAll((node) => node.type === "button" && text(node) === label);
  const output = () => renderer.root.findAll((node) => node.type === "pre").map((node) => node.children.join("")).join("");
  return {
    setup, runs, output, observed,
    holdStatus: (id: string) => heldStatuses.add(id),
    allowStatus: (id: string) => heldStatuses.delete(id),
    async releaseStatus(id: string, status: SetupStatus) {
      const reads = pendingStatuses.filter((read) => read.workspaceId === id);
      assert.ok(reads.length > 0, "a setup snapshot is in flight for the specified workspace");
      heldStatuses.delete(id);
      await act(async () => { for (const read of reads) read.resolve(status); });
    },
    async releaseStart(id: string) {
      const finish = pendingStarts.get(id);
      assert.ok(finish, "a real Setup button started a deferred IPC request");
      pendingStarts.delete(id);
      await act(async () => { finish(); });
    },
    async switchWorkspace(workspace: Props["workspace"]) {
      currentWorkspace = workspace;
      await act(async () => { renderer.update(panel()); });
    },
    async showRun() { tab = "run"; await act(async () => { renderer.update(panel()); }); },
    async emit(payload: unknown) { await act(async () => { for (const listener of [...listeners]) listener({ payload }); }); },
    async click(text: string) {
      const matches = buttons(text);
      assert.equal(matches.length, 1, `one real ${text} button`);
      assert.equal(matches[0].props.disabled, false, `${text} is enabled`);
      const onClick = matches[0].props.onClick;
      assert.equal(typeof onClick, "function");
      if (typeof onClick !== "function") assert.fail("Setup button has no handler");
      await act(async () => { onClick(); });
    },
    enabled: (text: string) => buttons(text).length === 1 && buttons(text)[0].props.disabled === false,
    pending: () => renderer.root.findAll((node) => node.type === "button" && node.props.disabled === true && text(node).includes("Running...")).length === 1,
    state: () => observed.filter((entry) => entry.workspaceId === currentWorkspace.id).slice(-1)[0]?.state,
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("actual Setup panel hides the previous workspace transcript and status while the new snapshot is pending", async (t) => {
  const f = await fixture();
  t.after(f.close);
  assert.match(f.output(), /A transcript/);
  assert.equal(f.state(), "running");
  f.holdStatus(b.id);
  await f.switchWorkspace(b);
  assert.doesNotMatch(f.output(), /A transcript/, "the new workspace must not display the previous transcript");
  assert.equal(f.state(), "idle", "the strip callback belongs to the displayed workspace");
  assert.ok(f.enabled("Run setup"));
  await f.releaseStatus(b.id, idle());
});

test("actual Setup panel starts a new workspace stream without the previous transcript", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.holdStatus(b.id);
  await f.switchWorkspace(b);
  await f.emit({ type: "output", workspaceId: b.id, kind: "setup", scriptId: "setup", chunk: "B streamed output\n" });
  assert.equal(f.output(), "B streamed output\n", "setup events append only to this workspace's transcript");
  assert.equal(f.state(), "running");
  await f.releaseStatus(b.id, running("B streamed output\n"));
});

test("actual Setup panel ignores an obsolete shared refresh after another workspace has loaded", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.holdStatus(a.id);
  await f.emit({ type: "setupFinished", workspaceId: a.id, state: "completed", exitCode: 0, logPath: "", log: "A complete\n" });
  f.setup.set(b.id, { state: "completed", log: "B complete\n", last: null });
  f.runs.set(b.id, [{ workspaceId: b.id, scriptId: "test", state: "running", exit: null }]);
  await f.switchWorkspace(b);
  assert.equal(f.output(), "B complete\n");
  assert.equal(f.state(), "completed");
  await f.releaseStatus(a.id, { state: "failed", log: "obsolete A response\n", last: null });
  assert.equal(f.output(), "B complete\n", "a retired refresh cannot replace the current setup snapshot");
  assert.equal(f.state(), "completed");
  await f.showRun();
  assert.equal(f.output(), "setup-b run test\n", "the same retired refresh cannot replace the current run status");
});

test("actual Setup panel keeps pending actions scoped to their workspace and request", async (t) => {
  const f = await fixture(idle());
  t.after(f.close);
  await f.click("Run setup");
  assert.ok(f.pending());
  await f.switchWorkspace(b);
  assert.ok(f.enabled("Run setup"), "another workspace's deferred start must not disable this workspace");
  await f.click("Run setup");
  assert.ok(f.pending());
  await f.releaseStart(a.id);
  assert.ok(f.pending(), "completion of the old request must not clear the new request's pending action");
  assert.doesNotMatch(f.output(), /setup-a/);
  await f.releaseStart(b.id);
  assert.equal(f.pending(), false);
  assert.ok(f.enabled("Stop setup"));
  assert.equal(f.output(), "setup-b started\n");
});

for (const revisit of [false, true]) {
  test(`actual Setup panel keeps the newest same-workspace snapshot${revisit ? " after leaving and returning" : ""}`, async (t) => {
    const f = await fixture();
    t.after(f.close);
    f.holdStatus(a.id);
    await f.switchWorkspace({ ...a });
    f.allowStatus(a.id);
    if (revisit) await f.switchWorkspace(b);
    f.setup.set(a.id, { state: "completed", log: "A completed\n", last: null });
    if (revisit) await f.switchWorkspace(a);
    else await f.emit({ type: "setupFinished", workspaceId: a.id, state: "completed", exitCode: 0, logPath: "", log: "A completed\n" });
    assert.equal(f.state(), "completed");
    assert.equal(f.output(), "A completed\n");
    assert.ok(f.enabled("Rerun setup"));
    await f.releaseStatus(a.id, running("obsolete A running snapshot\n"));
    assert.equal(f.state(), "completed", "an older response cannot restore the completed setup's running state");
    assert.equal(f.output(), "A completed\n", "an older response cannot replace the completed transcript");
    assert.ok(f.enabled("Rerun setup"), "an older response cannot replace Rerun setup with Stop setup");
  });
}
