import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { closedArchiveFilterFixture } from "../../evidence/home-archive-select-keyboard/closedArchiveFilterFixture.ts";
import ts from "typescript";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = new Date(2026, 10, 17, 12).getTime();

type ContextRequest = { row: home.HomeRow; at: { x: number; y: number } };

async function fixture() {
  const workspace = (id: string, extra: Partial<Workspace> = {}): Workspace => ({
    id, name: id, userSetWorkspaceName: true, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW, ...extra,
  });
  const repos: Repo[] = [{
    id: "repo", name: "Project", path: "/fixture/project", defaultBranch: "main",
    workspaces: [workspace("Alpha"), workspace("Beta"), workspace("Backlog", { state: "unstarted" }), workspace("Old", { status: "archived", state: "archived" })],
  }];
  const actions: Action[] = [];
  const requests: ContextRequest[] = [];
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "all" }), saveFilters() {} },
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
    "./home/ArchiveFilter": closedArchiveFilterFixture,
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
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(AllWorkspaces, {
      repos, sidebarVisible: true, dispatch: (action: Action) => actions.push(action), onCreateWorkspace() {},
      onWorkspaceContextMenu: (row: home.HomeRow, at: { x: number; y: number }) => requests.push({ row, at }),
    }));
  });
  const rows = () => renderer.root.findAllByProps({ role: "option" });
  const row = (title: string) => {
    const node = rows().find((node: { props: { title: string } }) => node.props.title === title);
    assert.ok(node, `mounted row ${title}`);
    return node;
  };
  return {
    actions, requests, row,
    async context(title: string, x = 73, y = 91) {
      const target = row(title);
      assert.equal(typeof target.props.onContextMenu, "function", "active Home row must expose its context-menu request handler");
      let prevented = false;
      await act(async () => { target.props.onContextMenu({ clientX: x, clientY: y, preventDefault() { prevented = true; } }); });
      assert.equal(prevented, true, "handled context request suppresses the native page menu");
    },
    async click(title: string) { await act(async () => { row(title).props.onClick(); }); },
    async key(key: string) {
      await act(async () => { renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onKeyDown({ key, preventDefault() {} }); });
    },
    async query(value: string) {
      await act(async () => { renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onChange({ target: { value } }); });
    },
    async unarchive() {
      const button = renderer.root.findByProps({ "aria-label": "Unarchive workspace" });
      let stopped = false, prevented = false;
      await act(async () => { button.props.onClick({ stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } }); });
      assert.equal(stopped && prevented, true);
      assert.equal(renderer.root.findByProps({ "aria-label": "Unarchive workspace" }).props.disabled, true);
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home context control: primary click still opens the clicked row", async () => {
  const view = await fixture();
  try {
    await view.click("Beta");
    assert.equal(view.actions.at(-1)?.type, "select");
    const action = view.actions.at(-1);
    assert.ok(action?.type === "select" && action.selection.kind === "workspace");
    assert.equal(action.selection.workspaceId, "Beta");
    assert.deepEqual(view.requests, []);
  } finally { await view.close(); }
});

test("Home context control: keyboard selection and Enter remain separate from menus", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("Enter");
    const action = view.actions.at(-1);
    assert.ok(action?.type === "select" && action.selection.kind === "workspace");
    assert.equal(action.selection.workspaceId, "Beta");
    assert.deepEqual(view.requests, []);
  } finally { await view.close(); }
});

test("Home context control: archived and unstarted rows do not gain the active-only menu", async () => {
  const view = await fixture();
  try {
    assert.equal(view.row("Old").props.onContextMenu, undefined);
    assert.equal(view.row("Backlog").props.onContextMenu, undefined);
    assert.deepEqual(view.requests, []);
  } finally { await view.close(); }
});

test("Home context control: existing archived Unarchive button still consumes and dispatches once", async () => {
  const view = await fixture();
  try {
    await view.unarchive();
    assert.equal(view.actions.length, 1);
    assert.equal(view.actions[0].type, "unarchiveWorkspace");
    assert.equal("workspaceId" in view.actions[0] && view.actions[0].workspaceId, "Old");
    assert.deepEqual(view.requests, []);
  } finally { await view.close(); }
});

test("Home context: active row emits its own workspace identity and pointer position without navigating", async () => {
  const view = await fixture();
  try {
    await view.context("Beta");
    assert.equal(view.requests.length, 1);
    assert.equal(view.requests[0].row.workspace.id, "Beta");
    assert.equal(view.requests[0].row.repo.id, "repo");
    assert.equal(view.requests[0].at.x, 73);
    assert.equal(view.requests[0].at.y, 91);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home context: right-click target is independent of the keyboard-selected row", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.context("Alpha", 12, 34);
    assert.equal(view.requests[0].row.workspace.id, "Alpha");
    assert.equal(view.row("Beta").props["aria-selected"], true);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home context: filtering preserves the visible row target instead of an old result index", async () => {
  const view = await fixture();
  try {
    await view.query("Beta");
    await view.context("Beta");
    assert.equal(view.requests[0].row.workspace.id, "Beta");
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});
