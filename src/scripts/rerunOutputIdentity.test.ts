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
const a: Props["workspace"] = { id: "identity-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "identity-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "identity-repo", name: "Run identity", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture({ task = "dev", legacy = false, empty = false, failStart = false } = {}) {
  const commands: { name: string; args: Record<string, unknown> }[] = [];
  const modules = new Map<string, { exports: SourceExports }>();
  const listeners = new Set<(event: { payload: unknown }) => void>();
  const runs = new Map<string, RunStatus[]>([
    [a.id, [{ workspaceId: a.id, scriptId: task, ...(legacy ? {} : { runId: "run-1" }), state: "stopped", exit: [0, null] }]],
    [b.id, [{ workspaceId: b.id, scriptId: task, runId: "run-1", state: "stopped", exit: [0, null] }]],
  ]);
  const output = new Map([[a.id, empty ? "" : "previous transcript\n"], [b.id, "other workspace transcript\n"]]);
  const reads: { runId: string | undefined; resolve: (text: string) => void }[] = [];
  let held = false;
  let workspace = a;
  let nextId = 2;
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    const workspaceId = String(args.workspaceId ?? (args.workspace as { workspaceId?: string } | undefined)?.workspaceId);
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: ["dev", "test"].map((id) => ({ id, label: id === "dev" ? "Dev" : "Test", command: `fixture-${id}`, args: [], cwd: null, default: id === "dev", icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" })), managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: (runs.get(workspaceId) ?? []).map((run) => ({ ...run })), history: [task] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return held ? new Promise<string>((resolve) => { reads.push({ runId: runs.get(workspaceId)?.[0]?.runId, resolve }); }) : output.get(workspaceId) ?? null;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_start": {
        commands.push({ name, args });
        if (failStart) throw new Error("fixture start rejected");
        const runId = `run-${nextId++}`;
        runs.set(workspaceId, [{ workspaceId, scriptId: String(args.scriptId), runId, state: "running", exit: null }]);
        output.set(workspaceId, "");
        return runId;
      }
      case "run_script_stop":
        commands.push({ name, args });
        runs.set(workspaceId, (runs.get(workspaceId) ?? []).map((run) => ({ ...run, state: "stopped" })));
        return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in run-identity regression"); } },
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
      if (name === "@tauri-apps/api/event") return { listen: async (event: string, listener: (event: { payload: unknown }) => void) => { if (event === "scripts://event") listeners.add(listener); return () => listeners.delete(listener); } };
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
  async function emit(payload: unknown) { await act(async () => { for (const listener of [...listeners]) listener({ payload }); }); }
  return {
    commands,
    text: () => nodes((node) => node.type === "pre").map((node) => node.children.join("")).join(""),
    outputs: () => nodes((node) => node.type === "pre").length,
    hasText: (text: string) => nodes((node) => node.children.filter((child) => typeof child === "string").join("") === text).length > 0,
    runId: () => runs.get(workspace.id)?.[0]?.runId,
    holdReads: () => { held = true; },
    async releaseReads(text: string, runId?: string) {
      const pending = reads.filter((read) => runId === undefined || read.runId === runId);
      assert.ok(pending.length > 0, "at least one matching actual output request is held");
      for (const read of pending) reads.splice(reads.indexOf(read), 1);
      held = false;
      await act(async () => { for (const read of pending) read.resolve(text); });
    },
    async refresh() { await emit({ type: "runStarted", workspaceId: workspace.id, scriptId: task, state: "running", exit: null }); },
    async finish() {
      runs.set(workspace.id, (runs.get(workspace.id) ?? []).map((run) => ({ ...run, state: "stopped", exit: [0, null] })));
      await emit({ type: "runFinished", workspaceId: workspace.id, scriptId: task, state: "stopped", exit: [0, null] });
    },
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

for (const task of ["dev", "test"]) {
  test(`same-task ${task} rerun hides the previous run's transcript before the replacement output read resolves`, async (t) => {
    const f = await fixture({ task });
    t.after(f.close);
    assert.equal(f.runId(), "run-1");
    assert.equal(f.text(), "previous transcript\n");
    f.holdReads();
    await f.primary(task === "dev" ? "Run Dev" : "Run Test");
    assert.equal(f.runId(), "run-2", "the actual status has a new run identity");
    assert.equal(f.text(), "", "the replacement must not borrow the previous run's transcript while its read is pending");
    assert.equal(f.outputs(), 1, "a quiet admitted run still owns an output surface");
    await f.releaseReads("replacement transcript\n");
    assert.equal(f.text(), "replacement transcript\n");
    assert.deepEqual(f.commands.map((command) => [command.name, command.args.scriptId]), [["run_script_start", task]]);
  });
}

test("same-run refresh and completion retain its transcript while fresh reads are pending", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.holdReads();
  await f.refresh();
  assert.equal(f.text(), "previous transcript\n");
  await f.finish();
  assert.equal(f.runId(), "run-1");
  assert.equal(f.text(), "previous transcript\n", "completion is not a new run identity");
  await f.releaseReads("completed transcript\n");
  assert.equal(f.text(), "completed transcript\n");
  assert.deepEqual(f.commands, []);
});

test("a late previous-run output read cannot overwrite the replacement transcript", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.holdReads();
  await f.refresh();
  await f.primary("Run Dev");
  await f.releaseReads("replacement transcript\n", "run-2");
  assert.equal(f.text(), "replacement transcript\n");
  await f.releaseReads("obsolete previous-run snapshot\n", "run-1");
  assert.equal(f.text(), "replacement transcript\n");
  assert.equal(f.runId(), "run-2");
});

test("equal run IDs in different workspaces cannot share output", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.holdReads();
  await f.switchWorkspace(b);
  assert.equal(f.runId(), "run-1");
  assert.equal(f.text(), "");
  await f.releaseReads("other workspace transcript\n");
  assert.equal(f.text(), "other workspace transcript\n");
  await f.switchWorkspace(a);
  assert.equal(f.text(), "previous transcript\n");
  assert.deepEqual(f.commands, []);
});

test("legacy output and completed empty output stay readable without inventing identities", async (t) => {
  const legacy = await fixture({ legacy: true });
  t.after(legacy.close);
  assert.equal(legacy.runId(), undefined);
  assert.equal(legacy.text(), "previous transcript\n");
  const empty = await fixture({ empty: true });
  t.after(empty.close);
  assert.equal(empty.runId(), "run-1");
  assert.equal(empty.outputs(), 1);
  assert.equal(empty.text(), "");
});

test("a rejected replacement keeps the prior run and the action error", async (t) => {
  const f = await fixture({ failStart: true });
  t.after(f.close);
  await f.primary("Run Dev");
  assert.equal(f.runId(), "run-1");
  assert.equal(f.text(), "previous transcript\n");
  assert.ok(f.hasText("fixture start rejected"));
});
