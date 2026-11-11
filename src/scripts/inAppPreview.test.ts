import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runInThisContext } from "node:vm";
import type { ComponentProps, ReactNode } from "react";
import type { PanelStrip } from "../components/PanelStrip";

const deps = createRequire(new URL("../../package.json", import.meta.url));
const React: typeof import("react") = deps("react");
const ts: typeof import("typescript") = deps("typescript");
type Node = { type: unknown; props: Record<string, unknown>; children: (Node | string)[]; findAll: (predicate: (node: Node) => boolean) => Node[] };
type Renderer = { root: Node; unmount: () => void; update: (element: ReactNode) => void };
const { create, act }: {
  create: (element: ReactNode, options: { createNodeMock: () => unknown }) => Renderer;
  act: (callback: () => void | Promise<void>) => Promise<void>;
} = deps("react-test-renderer");
type Props = ComponentProps<typeof PanelStrip>;
type OpenPreview = (workspaceId: string, url: string) => boolean;
const a: Props["workspace"] = { id: "browser-a", name: "A", branch: "main", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 0, path: "/fixture/a" };
const b: Props["workspace"] = { ...a, id: "browser-b", name: "B", path: "/fixture/b" };
const repo: Props["repo"] = { id: "browser-repo", name: "Preview", path: "/fixture/repo", defaultBranch: "main", workspaces: [a, b] };

async function fixture(enabled: boolean, accepted: boolean | null = true) {
  const external: string[] = [];
  const embedded: { workspaceId: string; url: string }[] = [];
  const modules = new Map<string, { exports: Record<string, unknown> & { PanelStrip?: typeof PanelStrip } }>();
  let currentWorkspace = a;
  let inApp = enabled;
  const shortcuts: Record<string, () => unknown> = {};
  const inert = () => null;
  const emptyTabs = { tabs: [], activeId: null };
  async function invoke(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "scripts_config": return {
        setup: null, setupLayer: null, archive: null, runMode: "concurrent", autoRunAfterSetup: false,
        run: [{ id: "dev", label: "Dev", command: "fixture-dev", args: [], cwd: null, default: true, icon: "play", hide: false, availableIn: ["local"], layer: "repo_shared" }],
        managedKeys: [], warnings: [],
      };
      case "run_script_status": return { runs: [{ workspaceId: args.workspaceId, scriptId: "dev", state: "running", exit: null }], history: [] };
      case "setup_script_status": return { state: "idle", log: null, last: null };
      case "run_script_output": return "fixture running\n";
      case "run_script_preview_env": return [["CONDUCTOR_WORKSPACE_NAME", currentWorkspace.name], ["CONDUCTOR_PORT", currentWorkspace.id === a.id ? "51001" : "51002"]];
      case "spotlight_testing_get": return { enabled: false, layer: "repo_local", managed: false };
      case "spotlight_status": return { active: false, workspaceId: null };
      default: throw new Error(`Unexpected IPC: ${name}`);
    }
  }
  const boundaries: Record<string, unknown> = {
    "src/backend": { inTauri: () => true, openUrl: async (url: string) => { external.push(url); } },
    "src/keybindings/KeybindingsProvider": { useKeybindings: (bindings: typeof shortcuts) => Object.assign(shortcuts, bindings) },
    "src/settings/useBoolPref": { useBoolPref: (key: string) => { assert.equal(key, "experimental_in_app_browser_preview"); return inApp; } },
    "src/settings/useRepoSettings": { useRepoSettings: () => ({ previewUrls: { value: [{ name: "Local", url: "http://localhost:$CONDUCTOR_PORT/$CONDUCTOR_WORKSPACE_NAME" }] } }) },
    "src/settings/appPrefs": { useAppPrefs: () => ({ experimental_tab_freak_mode: false }) },
    "src/features/terminal/session": { subscribeTabs: () => inert, getTabs: () => emptyTabs, restoreWorkspaceTabs: async () => {}, closeTab: inert, openTab: inert, selectTab: inert },
    "src/features/terminal/tabs": { terminalTabs: () => [], canOpenTerminal: () => true },
    "src/features/terminal/shellIntegration": { tabLabel: inert },
    "src/features/terminal/TerminalPanel": { TerminalHost: inert },
    "src/features/chat/ChatModelPicker": { openRepoSettingsPage: inert },
    "src/features/files/panelIcons": { ChevronDownIcon: inert, ChevronRightIcon: inert, PlusIcon: inert, XIcon: inert },
    "src/components/ScriptOutput": { ScriptOutput: ({ output }: { output: string }) => React.createElement("pre", null, output) },
    "src/components/ui/Tooltip": { Tooltip: ({ children }: { children: ReactNode }) => children, ShortcutHint: inert },
    "src/settings/rows/runIcons": { RunIcon: inert },
    "src/components/Icons": { ChevronDownIcon: inert, SettingsIcon: inert, GlobeIcon: inert },
    "src/components/PopoverMenu": { PopoverMenu: inert },
  };
  const sources = new Set([
    "src/components/PanelStrip", "src/components/ScriptsPanel", "src/components/RunSplitButton", "src/components/PreviewOpenButton", "src/lib/keyedCache",
    "src/scripts/api", "src/scripts/model", "src/scripts/preview", "src/scripts/runTab", "src/spotlight/testingApi", "src/spotlight/testing",
  ]);
  function load(file: string) {
    const cached = modules.get(file);
    if (cached) return cached.exports;
    assert.ok(sources.has(file), `Unexpected source dependency: ${file}`);
    const path = file + (file.startsWith("src/components/") ? ".tsx" : ".ts");
    const module: { exports: Record<string, unknown> & { PanelStrip?: typeof PanelStrip } } = { exports: {} };
    modules.set(file, module);
    const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX } });
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
  const { PanelStrip: Strip } = load("src/components/PanelStrip");
  assert.ok(Strip);
  const onOpenPreview: OpenPreview = (workspaceId, url) => { embedded.push({ workspaceId, url }); return accepted === true; };
  const panel = () => React.createElement(Strip, {
    repo, workspace: currentWorkspace, open: true, setOpen: inert, view: "run", setView: inert, cwd: currentWorkspace.path ?? "",
    ...(accepted === null ? {} : { onOpenPreview }),
  });
  let renderer: Renderer;
  await act(async () => { renderer = create(panel(), { createNodeMock: () => ({}) }); });
  return {
    external, embedded,
    open: () => act(async () => {
      const button = renderer.root.findAll((node) => node.type === "button" && typeof node.props["aria-label"] === "string" && node.props["aria-label"].startsWith("Open http://localhost:"));
      assert.equal(button.length, 1, "the actual mounted Run Open button");
      const click = button[0].props.onClick;
      assert.equal(typeof click, "function");
      if (typeof click === "function") click();
    }),
    shortcut: () => act(async () => { assert.equal(shortcuts["terminal.openLocalhost"](), true); }),
    switchWorkspace: () => act(async () => { currentWorkspace = b; renderer.update(panel()); }),
    setEnabled: (value: boolean) => act(async () => { inApp = value; renderer.update(panel()); }),
    close: () => act(async () => { renderer.unmount(); }),
  };
}

test("mounted Run Open honors the enabled in-app preview setting", async (t) => {
  const f = await fixture(true); t.after(f.close);
  await f.open();
  assert.deepEqual(f.embedded, [{ workspaceId: a.id, url: "http://localhost:51001/A" }]);
  assert.deepEqual(f.external, []);
});

test("mounted Run shortcut honors the enabled setting and captured workspace URL", async (t) => {
  const f = await fixture(true); t.after(f.close);
  await f.switchWorkspace(); await f.shortcut();
  assert.deepEqual(f.embedded, [{ workspaceId: b.id, url: "http://localhost:51002/B" }]);
  assert.deepEqual(f.external, []);
});

test("the disabled setting and live setting changes retain the external route", async (t) => {
  const f = await fixture(false); t.after(f.close);
  await f.open();
  assert.deepEqual(f.external, ["http://localhost:51001/A"]);
  assert.deepEqual(f.embedded, []);
  await f.setEnabled(true); await f.open();
  assert.equal(f.embedded.length, 1);
  await f.setEnabled(false); await f.shortcut();
  assert.equal(f.external.length, 2);
  assert.equal(f.embedded.length, 1);
});

for (const accepted of [false, null]) test(`Run safely falls back externally when embedded destination is ${accepted === null ? "absent" : "unavailable"}`, async (t) => {
  const f = await fixture(true, accepted); t.after(f.close);
  await f.open();
  assert.deepEqual(f.external, ["http://localhost:51001/A"]);
});
