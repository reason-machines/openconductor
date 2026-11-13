import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Repo } from "../../state/types.ts";
import type { OpenInApp } from "./apps.ts";
import * as persistence from "../../lib/persistence/producer.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const installed: OpenInApp[] = [
  { id: "cursor", name: "Cursor", iconType: "code", icon: null },
  { id: "terminal", name: "Terminal", iconType: "terminal", icon: null },
];
const rootPath = "/Users/demo/code/tide-web";
const workspacesPath = "/Users/demo/.openconductor/workspaces/tide-web";

function load(file: string, exported: object, imports: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    Error,
    console,
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout() { return 0; },
    clearTimeout() {},
    exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      if (name === "../../lib/persistence/producer.ts") return persistence;
      assert.ok(name in imports, `Unexpected Settings shortcut dependency: ${name}`);
      return imports[name];
    },
  });
}

async function fixture(defaultId = "cursor", samePath = false) {
  const calls: string[] = [];
  const path = samePath ? rootPath : workspacesPath;
  const native = {
    isTauri: () => true,
    async invoke(command: string, args: unknown) {
      if (command === "open_in_apps") return installed;
      calls.push(JSON.stringify({ command, args }));
    },
  };
  const apps: Partial<typeof import("./apps.ts")> = {};
  load("./apps.ts", apps, { "@tauri-apps/api/core": native });
  const component: Partial<typeof import("./OpenInButton.tsx")> = {};
  const inert = () => null;
  load("./OpenInButton.tsx", component, {
    "../../components/ui/Tooltip.tsx": { Tooltip: ({ children }: { children: React.ReactNode }) => children, ShortcutHint: inert },
    "../../components/motion/usePresence.ts": { usePresence: (open: boolean) => ({ mounted: open, attrs: {} }) },
    "../../keybindings/dispatcher.ts": { PRIORITY: { DIALOG: 100 } },
    "../../keybindings/KeybindingsProvider": {
      useKeybindingOverrides: () => ({ overrides: {} }),
      useKeybindings() {},
    },
    "../../keybindings/overrides.ts": { effectiveShortcuts: () => [{}] },
    "../../keybindings/shortcut.ts": { glyphs: () => "⌘⇧O" },
    "../../components/Icons": { ChevronDownIcon: inert, CodeIcon: inert, CopyIcon: inert, FolderIcon: inert, TerminalIcon: inert },
    "../../settings/appPrefs": {
      useAppPrefs: () => ({ default_open_in: defaultId, open_in_mru_order: [] }),
      async recordOpenIn(appId: string, isRemote: boolean) {
        calls.push(JSON.stringify({ command: "record_open_in", args: { appId, isRemote } }));
      },
    },
    "./apps": apps,
    "./AppSwitcher.tsx": { AppSwitcher: inert },
    "./openIn.css": {},
  });
  const misc: Partial<typeof import("../../settings/repoMisc.ts")> = {};
  load("../../settings/repoMisc.ts", misc, { "@tauri-apps/api/core": native });
  const rows: Partial<typeof import("../../settings/rows/RepoMiscRows.tsx")> = {};
  load("../../settings/rows/RepoMiscRows.tsx", rows, {
    "@base-ui/react/popover": { Popover: { Root: inert, Trigger: inert, Portal: inert, Positioner: inert, Popup: inert } },
    "../../components/RepoIcon": { RepoIcon: inert },
    "../../components/RepoIconDialog": { RepoIconPicker: inert },
    "../../components/RemoveRepositoryDialog": { RemoveRepositoryDialog: inert },
    "../../components/Icons": { ArrowUpRightIcon: inert, ChevronDownIcon: inert, ChevronUpIcon: inert, CircleAlertIcon: inert, PlusIcon: inert, RefreshCwIcon: inert },
    "../../backend": { openUrl: async () => {} },
    "./rows.css": {},
    "./repoIconPopover.css": {},
    "../../features/openIn/OpenInButton": component,
    "../GeneralPage": {
      Row: ({ label, children }: { label: string; children: React.ReactNode }) =>
        label === "Root path" || label === "Workspaces path" ? React.createElement("section", { "data-row": label }, children) : null,
    },
    "../icons": { TrashIcon: inert },
    "../rootPath": { repoWorkspacesPath: async () => path },
    "../repoSettings": { repoSettingsSetLocal: async () => {} },
    "../useRepoSettings": { notifyRepoSettingsChanged() {}, useRepoSettings: () => undefined },
    "../repoMisc": misc,
  });
  const RepoMiscRows = rows.RepoMiscRows;
  assert.ok(RepoMiscRows);
  const repo: Repo = { id: "tide-web", name: "tide-web", path: rootPath, defaultBranch: "main", workspaces: [] };
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(RepoMiscRows, {
      repo,
      actions: { onSetIcon() {}, onRemoved() {}, notify() {} },
    }));
  });
  const row = (label: string) => renderer.root.findByProps({ "data-row": label });
  return {
    calls,
    workspacesPath: path,
    async open(label: string) {
      await act(async () => { row(label).findByProps({ className: "oi-chevron" }).props.onClick(); });
    },
    hints(label: string) {
      return row(label).findAllByProps({ className: "oi-row-kbd" }).map((node: { props: { children: React.ReactNode } }) => node.props.children);
    },
    badges(label: string) {
      return row(label).findAllByProps({ className: "oi-row-num" }).map((node: { props: { children: React.ReactNode } }) => node.props.children);
    },
    hintApps(label: string) {
      return row(label).findAllByProps({ className: "oi-row-kbd" }).map((node: { parent: { parent: { props: Record<string, unknown> } } }) => node.parent.parent.props["data-app"]);
    },
    async click(label: string, appId: string) {
      await act(async () => { row(label).findByProps({ "data-app": appId }).props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

for (const defaultId of ["cursor", "terminal"]) {
  test(`Settings Workspaces path omits the ${defaultId} default-app shortcut hint`, async () => {
    const view = await fixture(defaultId);
    try {
      await view.open("Workspaces path");
      assert.deepEqual(view.hints("Workspaces path"), []);
    } finally { await view.close(); }
  });

  test(`Settings Root path retains the ${defaultId} default-app shortcut hint`, async () => {
    const view = await fixture(defaultId);
    try {
      await view.open("Root path");
      assert.deepEqual(view.hints("Root path"), ["⌘⇧O"]);
      assert.deepEqual(view.hintApps("Root path"), [defaultId]);
    } finally { await view.close(); }
  });
}

test("Settings shortcut hint follows row context even when both paths are identical", async () => {
  const view = await fixture("cursor", true);
  try {
    await view.open("Root path");
    await view.open("Workspaces path");
    assert.deepEqual(view.hints("Root path"), ["⌘⇧O"]);
    assert.deepEqual(view.hints("Workspaces path"), []);
  } finally { await view.close(); }
});

for (const label of ["Root path", "Workspaces path"]) {
  test(`Settings ${label} retains icon-only menus without numbered badges`, async () => {
    const view = await fixture();
    try {
      await view.open(label);
      assert.deepEqual(view.badges(label), []);
    } finally { await view.close(); }
  });

  test(`Settings ${label} keeps exact pointer launch and copy payloads`, async () => {
    const view = await fixture();
    const path = label === "Root path" ? rootPath : view.workspacesPath;
    try {
      await view.open(label);
      await view.click(label, "cursor");
      await view.open(label);
      await view.click(label, "copy-path");
      assert.deepEqual(view.calls, [
        JSON.stringify({ command: "record_open_in", args: { appId: "cursor", isRemote: false } }),
        JSON.stringify({ command: "open_in_app", args: { appId: "cursor", path } }),
        JSON.stringify({ command: "plugin:clipboard-manager|write_text", args: { text: path } }),
      ]);
    } finally { await view.close(); }
  });
}
