import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import * as bind from "../keybindings/bind.ts";
import * as dispatcher from "../keybindings/dispatcher.ts";
import * as listeners from "../keybindings/listeners.ts";
import * as overrides from "../keybindings/overrides.ts";
import * as selectAll from "../keybindings/selectAll.ts";
import * as shortcut from "../keybindings/shortcut.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const repositories: Repo[] = [{
  id: "project", name: "Project", path: "/fixture/project", defaultBranch: "main",
  workspaces: [{
    id: "workspace", name: "Working", userSetWorkspaceName: true, branch: "working", status: "idle",
    diff: { added: 0, removed: 0 }, createdAt: Date.UTC(2026, 10, 11, 12),
  }],
}];

function compile(file: string): string {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

async function fixture(repos: Repo[]) {
  const actions: Action[] = [];
  const globals = { window: new EventTarget(), document: new EventTarget() };
  const provider: Partial<typeof import("../keybindings/KeybindingsProvider")> = {};
  const providerImports: Record<string, unknown> = {
    "./bind.ts": bind, "./dispatcher.ts": dispatcher, "./listeners.ts": listeners,
    "./overrides.ts": overrides, "./selectAll.ts": selectAll,
  };
  runInNewContext(compile("../keybindings/KeybindingsProvider.tsx"), {
    ...globals, exports: provider,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in providerImports, `Unexpected keybinding provider dependency: ${name}`);
      return providerImports[name];
    },
  });
  const { KeybindingsProvider } = provider;
  assert.ok(KeybindingsProvider);

  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": home,
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/KeybindingsProvider": provider,
    "../keybindings/overrides": overrides,
    "../keybindings/shortcut": shortcut,
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => () => {} },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
  };
  const exported: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  runInNewContext(compile("./AllWorkspaces.tsx"), {
    ...globals, exports: exported,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Home dependency: ${name}`);
      return imports[name];
    },
  });
  const { AllWorkspaces } = exported;
  assert.ok(AllWorkspaces);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(KeybindingsProvider, {
      children: React.createElement(AllWorkspaces, {
        repos, sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); }, onCreateWorkspace() {},
      }),
    }));
  });
  const rows = (): { props: { title: string; "aria-selected": boolean } }[] => renderer.root.findAllByProps({ role: "option" });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  return {
    actions,
    visible: () => rows().map((row) => row.props.title),
    selected: () => rows().filter((row) => row.props["aria-selected"]).map((row) => row.props.title),
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async key(key: string) {
      const event = Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), {
        key, code: key === "Enter" ? "Enter" : "KeyX", keyCode: key === "Enter" ? 13 : 88,
        isComposing: false, nativeEvent: { isComposing: false },
        metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
      });
      await act(async () => { input().props.onKeyDown(event); });
      return event;
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home prevents Enter on an empty source list without activating a workspace", async () => {
  const view = await fixture([]);
  try {
    assert.deepEqual(view.visible(), []);
    const event = await view.key("Enter");
    assert.deepEqual(view.actions, [], "empty-source Enter must not dispatch an activation");
    assert.equal(event.defaultPrevented, true, "empty-source Enter must be prevented");
  } finally { await view.close(); }
});

test("Home prevents Enter after filtering a populated list to zero without activating a workspace", async () => {
  const view = await fixture(repositories);
  try {
    assert.deepEqual(view.visible(), ["Working"]);
    await view.query("zzzz-no-workspace-matches");
    assert.deepEqual(view.visible(), []);
    const event = await view.key("Enter");
    assert.deepEqual(view.actions, [], "zero-result Enter must not dispatch an activation");
    assert.equal(event.defaultPrevented, true, "zero-result Enter must be prevented");
  } finally { await view.close(); }
});

test("Home prevents nonempty Enter and activates the selected workspace exactly once", async () => {
  const view = await fixture(repositories);
  try {
    assert.deepEqual(view.visible(), ["Working"]);
    assert.deepEqual(view.selected(), ["Working"]);
    const event = await view.key("Enter");
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.actions.length, 1);
    const action = view.actions[0];
    assert.ok(action?.type === "select");
    assert.deepEqual({ ...action.selection }, { kind: "workspace", repoId: "project", workspaceId: "workspace" });
  } finally { await view.close(); }
});

test("Home leaves an unrelated empty-list character key unprevented without activation", async () => {
  const view = await fixture([]);
  try {
    assert.deepEqual(view.visible(), []);
    const event = await view.key("x");
    assert.equal(event.defaultPrevented, false);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
