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

function workspace(id: string, status: Workspace["status"] = "idle"): Workspace {
  return { id, name: id, userSetWorkspaceName: true, branch: id, status, diff: { added: 0, removed: 0 }, createdAt: NOW };
}

function repo(id: string, workspaces: Workspace[]): Repo {
  return { id, name: id, path: `/fixture/${id}`, defaultBranch: "main", workspaces };
}

async function fixture(repos: Repo[], filters: home.HomeFilters) {
  let createCalls = 0;
  const saved: home.HomeFilters[] = [];
  const actions: Action[] = [];
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": {
      ...home,
      loadFilters: () => ({ projects: [...filters.projects], archiveFilter: filters.archiveFilter }),
      saveFilters(value: home.HomeFilters) { saved.push({ projects: [...value.projects], archiveFilter: value.archiveFilter }); },
    },
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
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(AllWorkspaces, {
      repos, sidebarVisible: true, dispatch: (action: Action) => { actions.push(action); },
      onCreateWorkspace: () => { createCalls += 1; },
    }));
  });
  const empty = () => renderer.root.findAllByProps({ className: "allws-empty" });
  const buttons = () => {
    const containers = empty();
    assert.equal(containers.length, 1, "the settled empty-state container is visible");
    return containers[0].findAllByType("button");
  };
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  return {
    saved,
    actions,
    createCalls: () => createCalls,
    emptyCount: () => empty().length,
    visible: () => renderer.root.findAllByProps({ role: "option" }).map((row: { props: { title: string } }) => row.props.title),
    emptyActions: () => buttons().map((button: { children: unknown[] }) => button.children.join("")),
    expectMessage() {
      const spans = empty()[0].findAllByType("span");
      assert.ok(spans.some((span: { children: unknown[] }) => span.children.join("") === "No matching workspaces"));
    },
    expectHeaderCreate() {
      const header = renderer.root.findByProps({ className: "allws-header" });
      const button = header.findByType("button");
      assert.deepEqual(button.children, ["Create workspace"]);
      assert.equal(button.props.disabled, undefined);
    },
    queryValue: () => input().props.value,
    async query(value: string) { await act(async () => { input().props.onChange({ target: { value } }); }); },
    async clickEmpty() {
      const choices = buttons();
      assert.equal(choices.length, 1);
      assert.equal(choices[0].props.disabled, undefined);
      await act(async () => { choices[0].props.onClick(); });
    },
    async clickHeader() {
      const button = renderer.root.findByProps({ className: "allws-header" }).findByType("button");
      await act(async () => { button.props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home offers Clear filters for a settled archived-only local workspace list", async () => {
  const view = await fixture([repo("a", [workspace("old", "archived")])], home.DEFAULT_FILTERS);
  try {
    view.expectMessage();
    view.expectHeaderCreate();
    assert.deepEqual(view.emptyActions(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.deepEqual(view.visible(), ["old"]);
    assert.equal(view.emptyCount(), 0);
    assert.equal(view.queryValue(), "");
    assert.equal(view.createCalls(), 0);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home offers Create for an initially empty local list and retains the separate header action", async () => {
  const view = await fixture([], home.DEFAULT_FILTERS);
  try {
    view.expectMessage();
    view.expectHeaderCreate();
    assert.deepEqual(view.emptyActions(), ["Create a workspace"]);
    await view.clickEmpty();
    assert.equal(view.createCalls(), 1);
    await view.clickHeader();
    assert.equal(view.createCalls(), 2);
    assert.deepEqual(view.saved, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home clears a project-filter miss and reveals the existing workspace", async () => {
  const view = await fixture([repo("a", [workspace("live")]), repo("b", [])], { projects: ["b"], archiveFilter: "active" });
  try {
    view.expectMessage();
    assert.deepEqual(view.emptyActions(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.deepEqual(view.visible(), ["live"]);
    assert.equal(view.createCalls(), 0);
  } finally { await view.close(); }
});

test("Home clears active filters without clearing a nonmatching text query", async () => {
  const view = await fixture([repo("a", [workspace("live")])], home.DEFAULT_FILTERS);
  try {
    await view.query("unfindable-token");
    view.expectMessage();
    assert.deepEqual(view.emptyActions(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.equal(view.queryValue(), "unfindable-token");
    assert.deepEqual(view.emptyActions(), []);
    assert.deepEqual(view.visible(), []);
    assert.equal(view.createCalls(), 0);
  } finally { await view.close(); }
});

test("Home clears an archived-filter miss instead of offering Create", async () => {
  const view = await fixture([repo("a", [workspace("live")])], { projects: [], archiveFilter: "archived" });
  try {
    view.expectMessage();
    assert.deepEqual(view.emptyActions(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.deepEqual(view.visible(), ["live"]);
    assert.equal(view.createCalls(), 0);
  } finally { await view.close(); }
});

test("Home offers no empty-state action for an unfiltered empty list in all mode", async () => {
  const view = await fixture([], home.CLEARED_FILTERS);
  try {
    view.expectMessage();
    view.expectHeaderCreate();
    assert.deepEqual(view.emptyActions(), []);
    assert.deepEqual(view.saved, []);
  } finally { await view.close(); }
});

test("Home offers no empty-state action for a query miss with all filters cleared", async () => {
  const view = await fixture([repo("a", [workspace("live")])], home.CLEARED_FILTERS);
  try {
    await view.query("unfindable-token");
    view.expectMessage();
    view.expectHeaderCreate();
    assert.deepEqual(view.emptyActions(), []);
    assert.equal(view.queryValue(), "unfindable-token");
    assert.deepEqual(view.saved, []);
  } finally { await view.close(); }
});

test("Home clears a project-filter miss while already in all mode", async () => {
  const view = await fixture([repo("a", [workspace("live")]), repo("b", [])], { projects: ["b"], archiveFilter: "all" });
  try {
    view.expectMessage();
    assert.deepEqual(view.emptyActions(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.deepEqual(view.visible(), ["live"]);
    assert.equal(view.createCalls(), 0);
  } finally { await view.close(); }
});

test("Home renders nonempty rows without an empty-state action and preserves header Create", async () => {
  const view = await fixture([repo("a", [workspace("live")])], home.DEFAULT_FILTERS);
  try {
    assert.equal(view.emptyCount(), 0);
    assert.deepEqual(view.visible(), ["live"]);
    view.expectHeaderCreate();
    await view.clickHeader();
    assert.equal(view.createCalls(), 1);
    assert.deepEqual(view.saved, []);
  } finally { await view.close(); }
});
