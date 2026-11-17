import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Action } from "../state/store";
import type { Repo, Workspace } from "../state/types";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { bindCommands } from "../keybindings/bind.ts";
import { createDispatcher } from "../keybindings/dispatcher.ts";
import { createKeyListeners } from "../keybindings/listeners.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = new Date(2026, 10, 11, 12).getTime();

async function fixture(empty = false) {
  const actions: Action[] = [];
  const shellActions: string[] = [];
  const dispatcher = createDispatcher();
  const shellCommands = [
    "openKeyboardShortcuts", "openSettings", "sendFeedback", "toggleTheme", "view.zoomIn", "view.zoomOut",
    "view.resetZoom", "nav.back", "nav.forward", "view.toggleLeftSidebar", "view.toggleRightSidebar",
    "view.toggleZenMode", "toggleGarryMode", "nav.quickOpen", "workspace.create", "workspace.createFromPRBranchIssue", "quitApplication",
  ];
  const unbind = bindCommands(dispatcher, Object.fromEntries(shellCommands.map((id) => [id, () => { shellActions.push(id); }])));
  const listeners = createKeyListeners({ dispatcher, activeDialogId: () => null });
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => false },
    "../keybindings/KeybindingsProvider": { useKeybindingOverrides: () => ({ overrides: {} }) },
    "../keybindings/overrides": { effectiveShortcuts: () => [] },
    "../keybindings/shortcut": { glyphs: () => "" },
    "../workspace/archive": { listArchivedWorkspaces: async () => [], onArchiveEvent: () => () => {} },
    "./RepoIcon": { RepoIcon: inert },
    "./Tooltip": { Tooltip: ({ children }: { children: React.ReactNode }) => children },
    "./Icons": { ArchiveIcon: inert, ChevronDownIcon: inert, FolderIcon: inert, SearchIcon: inert, SidebarIcon: inert },
    "./RowStatusIcon": { RowStatusIcon: inert },
    "./StatusMatrix": { StatusMatrix: inert },
  };
  const exported: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  const javascript = ts.transpileModule(readFileSync(new URL("./AllWorkspaces.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports: exported, window: new EventTarget(), Date: class extends Date { static now() { return NOW; } },
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Home dependency: ${name}`);
      return imports[name];
    },
  });
  const { AllWorkspaces } = exported;
  assert.ok(AllWorkspaces);
  const repos: Repo[] = [{ id: "project", name: "Project", path: "/fixture/project", defaultBranch: "main", workspaces: empty ? [] : ["A", "B", "C"].map((id, index): Workspace => ({
    id, name: `Workspace ${id}`, userSetWorkspaceName: true, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - index * 60_000,
  })) }];
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(AllWorkspaces, { repos, sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); }, onCreateWorkspace() {} })); });
  return {
    actions,
    selected: (): string[] => renderer.root.findAllByProps({ role: "option" }).filter((node: { props: { "aria-selected": boolean } }) => node.props["aria-selected"]).map((node: { props: { title: string } }) => node.props.title),
    async key(key: string, flags: { isComposing?: boolean; keyCode?: number; defaultPrevented?: boolean } = {}) {
      let cancellations = 0;
      let stopped = false;
      const input = { tagName: "INPUT" };
      const nativeEvent = {
        key, code: key, repeat: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
        isComposing: false, keyCode: 0, defaultPrevented: false, ...flags,
        target: input, composedPath: () => [input],
        preventDefault() { this.defaultPrevented = true; cancellations += 1; },
        stopImmediatePropagation() { stopped = true; },
      };
      await act(async () => {
        listeners.keydownCapture(nativeEvent);
        if (!stopped) renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onKeyDown({
          ...nativeEvent, nativeEvent, preventDefault: () => nativeEvent.preventDefault(),
        });
        listeners.keydownBubble(nativeEvent);
      });
      assert.deepEqual(shellActions, [], "Default shell keybindings must not consume Home's plain key");
      assert.equal(stopped, false);
      return cancellations;
    },
    async close() { unbind(); await act(async () => { renderer.unmount(); }); },
  };
}

test("Home composing Enter does not open the selected workspace or cancel IME confirmation", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    assert.equal(await view.key("Enter", { isComposing: true }), 0);
    assert.deepEqual(view.actions, []);
    assert.deepEqual(view.selected(), ["Workspace B"]);
  } finally { await view.close(); }
});

test("Home legacy keyCode 229 Enter does not open the selected workspace", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    assert.equal(await view.key("Enter", { keyCode: 229 }), 0);
    assert.deepEqual(view.actions, []);
    assert.deepEqual(view.selected(), ["Workspace B"]);
  } finally { await view.close(); }
});

test("Home leaves composing and legacy-229 navigation to the input method", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    for (const flags of [{ isComposing: true }, { keyCode: 229 }]) {
      for (const key of ["ArrowDown", "ArrowUp", "Home", "End"]) {
        assert.equal(await view.key(key, flags), 0, key);
        assert.deepEqual(view.selected(), ["Workspace B"], key);
      }
    }
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home does not act on Enter or navigation already prevented upstream", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    for (const key of ["Enter", "ArrowDown", "ArrowUp", "Home", "End"]) {
      assert.equal(await view.key(key, { defaultPrevented: true }), 0, key);
      assert.deepEqual(view.actions, [], key);
      assert.deepEqual(view.selected(), ["Workspace B"], key);
    }
  } finally { await view.close(); }
});

test("Home ordinary Enter still opens the selected workspace", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    assert.equal(await view.key("Enter"), 1);
    assert.equal(view.actions.length, 1);
    const action = view.actions[0];
    assert.equal(action.type, "select");
    if (action.type === "select") assert.deepEqual({ ...action.selection }, { kind: "workspace", repoId: "project", workspaceId: "B" });
  } finally { await view.close(); }
});

test("Home ordinary arrows and endpoint keys retain selection navigation", async () => {
  const view = await fixture();
  try {
    for (const [key, target] of [["End", "C"], ["ArrowUp", "B"], ["Home", "A"], ["ArrowDown", "B"]]) {
      assert.equal(await view.key(key), 1);
      assert.deepEqual(view.selected(), [`Workspace ${target}`]);
    }
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home empty-list composing Enter is untouched while ordinary Enter stays cancelled", async () => {
  const view = await fixture(true);
  try {
    assert.equal(await view.key("Enter", { isComposing: true }), 0);
    assert.equal(await view.key("Enter", { keyCode: 229 }), 0);
    assert.equal(await view.key("Enter"), 1);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
