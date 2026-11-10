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
  id: "completion-workspace", name: "Completion", branch: "main", status: "idle",
  diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/workspace",
};
const repo: ComponentProps<typeof ScriptsPanel>["repo"] = {
  id: "completion-repo", name: "Completion", path: "/fixture/repo", defaultBranch: "main", workspaces: [workspace],
};
type Command = { name: string; args: Record<string, unknown> };
type SourceExports = Record<string, unknown> & { ScriptsPanel?: typeof ScriptsPanel };
type WireListener = (event: { payload: unknown }) => void;

async function fixture() {
  const commands: Command[] = [];
  const listeners = new Set<WireListener>();
  const modules = new Map<string, { exports: SourceExports }>();
  const output = new Map<string, string>();
  let runs: RunStatus[] = [];
  let statusReads = 0;
  const script = (id: string, label: string, isDefault: boolean) => ({
    id, label, command: `fixture-${id}`, args: [], cwd: null, default: isDefault,
    icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared",
  });
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: [script("dev", "Dev", true), script("test", "Test", false)], managedKeys: [], warnings: [],
      };
      case "run_script_status":
        statusReads++;
        return { runs, history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return output.get(String(args.scriptId)) ?? null;
      case "run_script_preview_env": return [];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      case "run_script_start": {
        commands.push({ name, args });
        const scriptId = String(args.scriptId);
        runs = [{ workspaceId: workspace.id, scriptId, state: "running", exit: null }];
        output.set(scriptId, `${scriptId} started\n`);
        return scriptId;
      }
      case "run_script_stop":
        commands.push({ name, args });
        runs = runs.map((run) => ({ ...run, state: "stopped", exit: [null, 15] }));
        return true;
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const passChildren = ({ children }: { children: ReactNode }) => children;
  const inert = () => null;
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: () => { throw new Error("No browser in completion regression"); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: inert },
    "src/settings/useRepoSettings": { useRepoSettings: () => ({ previewUrls: { value: [{ name: "Local", url: "http://localhost:55000" }] } }) },
    "src/components/ScriptOutput": { ScriptOutput: ({ output: text }: { output: string }) => React.createElement("pre", null, text) },
    "src/components/ui/Tooltip": { Tooltip: passChildren, ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert },
    "src/components/PopoverMenu": {
      PopoverMenu: ({ items, onClose }: { items: { label: string; onSelect: () => void }[]; onClose: () => void }) =>
        React.createElement("div", { role: "menu" }, items.map((item) => React.createElement("button", {
          key: item.label, role: "menuitem", onClick: () => { item.onSelect(); onClose(); },
        }, item.label))),
    },
  };
  const sources = new Set([
    "src/components/ScriptsPanel", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
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
  let renderer: Renderer;
  await act(async () => {
    renderer = create(React.createElement(Panel, {
      repo, workspace, tab: "run", active: true, actionsSlot: {} as HTMLElement,
      onShowRun: inert, onAddRunScript: inert,
    }), { createNodeMock: () => ({ getBoundingClientRect: () => ({ right: 200, bottom: 40 }) }) });
  });
  const buttons = (label: string) => renderer.root.findAll((node) => node.type === "button" && node.props["aria-label"] === label);
  async function click(predicate: (node: Node) => boolean) {
    const matches = renderer.root.findAll((node) => node.type === "button" && predicate(node));
    assert.equal(matches.length, 1, "one matching real component button");
    const onClick = matches[0].props.onClick;
    assert.equal(typeof onClick, "function");
    await act(async () => { (onClick as () => void)(); });
  }
  async function emit(payload: unknown) {
    await act(async () => { for (const listener of [...listeners]) listener({ payload }); });
  }
  return {
    commands,
    hasButton: (label: string) => buttons(label).length === 1,
    statusReads: () => statusReads,
    output: () => renderer.root.findAll((node) => node.type === "pre").map((node) => node.children.join("")).join(""),
    primary: (label: string) => click((node) => node.props["aria-label"] === label),
    async menu(label: string) {
      await click((node) => node.props["aria-label"] === "Select task");
      await click((node) => node.props.role === "menuitem" && node.children.join("") === label);
    },
    async finish(scriptId: string, code: number) {
      const status: RunStatus = { workspaceId: workspace.id, scriptId, state: "stopped", exit: [code, null] };
      runs = [...runs.filter((run) => run.scriptId !== scriptId), status];
      output.set(scriptId, `${output.get(scriptId) ?? ""}${scriptId} final output ${code}\n`);
      await emit({ type: "runFinished", ...status });
    },
    emit,
    close: () => act(async () => { renderer.unmount(); }),
  };
}

for (const code of [0, 7]) {
  test(`actual Run panel observes natural exit ${code}, keeps output and restarts without Stop IPC`, async (t) => {
    const f = await fixture();
    t.after(f.close);
    await f.primary("Run Dev");
    assert.ok(f.hasButton("Stop Dev"));
    assert.ok(f.hasButton("Open http://localhost:55000"));
    await f.finish("dev", code);
    assert.ok(f.hasButton("Run Dev"), "natural completion returns the real split button to Run");
    assert.equal(f.hasButton("Stop Dev"), false);
    assert.equal(f.hasButton("Open http://localhost:55000"), false, "finished processes have no busy-only Open action");
    assert.match(f.output(), new RegExp(`dev final output ${code}`));
    assert.equal(f.commands.length, 1, "completion itself sends no start or stop command");
    await f.primary("Run Dev");
    assert.deepEqual(f.commands.map((command) => [command.name, command.args.scriptId]), [
      ["run_script_start", "dev"], ["run_script_start", "dev"],
    ]);
  });
}

test("actual Run panel retains the explicitly picked task after its natural completion", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.menu("Test");
  assert.ok(f.hasButton("Stop Test"));
  await f.finish("test", 0);
  assert.ok(f.hasButton("Run Test"));
  assert.match(f.output(), /test final output 0/);
  await f.primary("Run Test");
  assert.deepEqual(f.commands.map((command) => command.args.scriptId), ["test", "test"]);
});

test("actual Run panel ignores completion from another workspace", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.primary("Run Dev");
  const before = f.statusReads();
  await f.emit({ type: "runFinished", workspaceId: "other-workspace", scriptId: "dev", state: "stopped", exit: [0, null] });
  assert.equal(f.statusReads(), before);
  assert.ok(f.hasButton("Stop Dev"));
  assert.equal(f.commands.length, 1);
});

test("actual Run panel reads current status instead of replacing a live run with a completion payload", async (t) => {
  const f = await fixture();
  t.after(f.close);
  await f.primary("Run Dev");
  await f.emit({ type: "runFinished", workspaceId: workspace.id, scriptId: "dev", state: "stopped", exit: [0, null] });
  assert.ok(f.hasButton("Stop Dev"));
  assert.ok(f.hasButton("Open http://localhost:55000"));
  assert.equal(f.commands.length, 1);
});
