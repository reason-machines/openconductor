import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const NOW = new Date(2026, 10, 11, 12).getTime();
const MINUTE = 60_000;

function fixtures(): Repo[] {
  const workspace = (id: string, age: number): Workspace => ({
    id, name: `Shared ${id}`, userSetWorkspaceName: true, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - age * MINUTE,
  });
  return [
    { id: "one", name: "Project One", path: "/fixture/one", defaultBranch: "main", workspaces: [workspace("A", 1)] },
    { id: "two", name: "Project Two", path: "/fixture/two", defaultBranch: "main", workspaces: [workspace("B", 2), workspace("C", 3)] },
  ];
}

async function fixture(projects: string[] = []) {
  const actions: Action[] = [];
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects, archiveFilter: "active" }), saveFilters() {} },
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
  const props = { repos: fixtures(), sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); }, onCreateWorkspace() {} };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(AllWorkspaces, props)); });
  const rows = (): { props: { title: string; "aria-selected": boolean; onClick(): void } }[] => renderer.root.findAllByProps({ role: "option" });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  async function choose(menu: string, label: string) {
    const button = renderer.root.findByProps({ "aria-label": menu });
    if (!button.props["aria-expanded"]) await act(async () => { button.props.onClick(); });
    const choices: { children: unknown[]; props: { onClick(): void } }[] = renderer.root.findAllByProps({ role: "menuitemcheckbox" });
    const choice = choices.find((node) => node.children.includes(label));
    assert.ok(choice, label);
    await act(async () => { choice.props.onClick(); });
  }
  return {
    actions,
    selected: () => rows().filter((node) => node.props["aria-selected"]).map((node) => node.props.title),
    visible: () => rows().map((node) => node.props.title),
    project: (label: string) => choose("Projects", label),
    archive: (label: string) => choose("Archived workspaces", label),
    async key(key: string) { await act(async () => { input().props.onKeyDown({ key, preventDefault() {} }); }); },
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async click(title: string) {
      const row = rows().find((node) => node.props.title === title);
      assert.ok(row, title);
      await act(async () => { row.props.onClick(); });
    },
    async update(repos: Repo[]) { await act(async () => { renderer.update(React.createElement(AllWorkspaces, { ...props, repos })); }); },
    expectOpen(repoId: string, workspaceId: string) {
      const action = actions.at(-1);
      assert.ok(action?.type === "select");
      assert.deepEqual({ ...action.selection }, { kind: "workspace", repoId, workspaceId });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home retains a surviving selected workspace and Enter target when a project filter removes earlier rows", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("ArrowDown");
    assert.deepEqual(view.selected(), ["Shared C"]);
    await view.project("Project Two");
    assert.deepEqual(view.visible(), ["Shared B", "Shared C"]);
    assert.deepEqual(view.selected(), ["Shared C"]);
    await view.key("Enter");
    view.expectOpen("two", "C");
    await view.key("ArrowUp");
    assert.deepEqual(view.selected(), ["Shared B"]);
  } finally { await view.close(); }
});

test("Home retains selection when clearing the project filter inserts earlier rows", async () => {
  const view = await fixture(["two"]);
  try {
    await view.key("ArrowDown");
    await view.project("All projects");
    assert.deepEqual(view.visible(), ["Shared A", "Shared B", "Shared C"]);
    assert.deepEqual(view.selected(), ["Shared C"]);
    await view.key("Enter");
    view.expectOpen("two", "C");
  } finally { await view.close(); }
});

test("Home resets to the first remaining row when the selected workspace is filtered out", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("ArrowDown");
    await view.project("Project One");
    assert.deepEqual(view.selected(), ["Shared A"]);
    await view.key("Enter");
    view.expectOpen("one", "A");
  } finally { await view.close(); }
});

test("Home selects the first row after an empty filtered list becomes nonempty", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("ArrowDown");
    await view.archive("Only archived");
    assert.deepEqual(view.visible(), []);
    assert.deepEqual(view.selected(), []);
    await view.key("Enter");
    assert.deepEqual(view.actions, []);
    await view.archive("Hiding archived");
    assert.deepEqual(view.selected(), ["Shared A"]);
    await view.key("Enter");
    view.expectOpen("one", "A");
  } finally { await view.close(); }
});

test("Home search changes reset selection even when the selected workspace still matches", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("ArrowDown");
    await view.query("Shared");
    assert.deepEqual(view.visible(), ["Shared A", "Shared B", "Shared C"]);
    assert.deepEqual(view.selected(), ["Shared A"]);
    await view.key("Enter");
    view.expectOpen("one", "A");
  } finally { await view.close(); }
});

test("Home row clicks activate that workspace rather than the previous keyboard target", async () => {
  const view = await fixture();
  try {
    await view.click("Shared C");
    view.expectOpen("two", "C");
  } finally { await view.close(); }
});

test("Home retains selection across same-group row reordering but resets after the selected row changes date group", async () => {
  const view = await fixture();
  try {
    await view.key("ArrowDown");
    await view.key("ArrowDown");
    const reordered = fixtures();
    const selected = reordered[1].workspaces[1];
    selected.updatedAt = NOW;
    await view.update(reordered);
    assert.deepEqual(view.selected(), ["Shared C"]);
    await view.key("Enter");
    view.expectOpen("two", "C");
    const regrouped = fixtures();
    regrouped[1].workspaces[1].createdAt = NOW - 24 * 60 * MINUTE;
    await view.update(regrouped);
    assert.deepEqual(view.selected(), ["Shared A"]);
    await view.key("Enter");
    view.expectOpen("one", "A");
  } finally { await view.close(); }
});
