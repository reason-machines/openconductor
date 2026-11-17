import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Action } from "../state/store";
import { reposFromDb, type DbRepoRow, type DbWorkspaceRow } from "../state/persisted.ts";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { archivedFromRows } from "../workspace/archivedList.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const CREATED = "2026-11-11T12:00:00Z";
const repository = (id: string): DbRepoRow => ({
  id, name: `Project ${id}`, rootPath: `/fixture/${id}`, remoteUrl: null,
  defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: CREATED,
});
const stored = (id: string, repositoryId = "a", state = "archived"): DbWorkspaceRow => ({
  id, repositoryId, state, directoryName: id, workspaceName: `Saved ${id}`, userSetWorkspaceName: true,
  branch: `topic/${id}`, intendedTargetBranch: "main", placeholderBranchName: null,
  derivedStatus: null, manualStatus: null, workspacePath: `/fixture/${repositoryId}/${id}`,
  pinnedAt: null, unread: false, prTitle: null, prDescription: null, number: null, createdAt: CREATED,
});

async function fixture(rows: DbWorkspaceRow[], filters: home.HomeFilters = home.DEFAULT_FILTERS, query = "", repoIds = ["a"]) {
  const repos = reposFromDb(repoIds.map(repository), rows, []);
  const archived = archivedFromRows(rows);
  const originals = JSON.stringify({ repos, archived });
  const saved: home.HomeFilters[] = [];
  const actions: Action[] = [];
  let createCalls = 0;
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": {
      ...home,
      loadFilters: () => ({ projects: [...filters.projects], archiveFilter: filters.archiveFilter }),
      saveFilters: (value: home.HomeFilters) => saved.push({ projects: [...value.projects], archiveFilter: value.archiveFilter }),
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
    "../workspace/archive": { listArchivedWorkspaces: async () => archived, onArchiveEvent: () => () => {} },
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
    exports: exported, window: new EventTarget(),
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected Home dependency: ${name}`);
      return imports[name];
    },
  });
  assert.ok(exported.AllWorkspaces);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(exported.AllWorkspaces!, {
      repos, sidebarVisible: true, dispatch: (action: Action) => actions.push(action),
      onCreateWorkspace: () => { createCalls += 1; },
    }));
  });
  const input = () => renderer.root.findByProps({ "aria-label": "Search workspaces" });
  if (query) await act(async () => { input().props.onChange({ target: { value: query } }); });
  const emptyButtons = () => renderer.root.findByProps({ className: "allws-empty" }).findAllByType("button");
  return {
    choices: () => emptyButtons().map((button: { children: unknown[] }) => button.children.join("")),
    visible: () => renderer.root.findAllByProps({ role: "option" }).map((row: { props: { title: string } }) => row.props.title),
    query: () => input().props.value,
    async clickEmpty() {
      const buttons = emptyButtons();
      assert.equal(buttons.length, 1);
      await act(async () => { buttons[0].props.onClick(); });
    },
    async clickHeader() {
      await act(async () => { renderer.root.findByProps({ className: "allws-header" }).findByType("button").props.onClick(); });
    },
    saved, actions, createCalls: () => createCalls,
    async close() {
      assert.equal(JSON.stringify({ repos, archived }), originals, "Rendering and clearing filters must preserve persisted inputs");
      await act(async () => { renderer.unmount(); });
    },
  };
}

for (const query of ["", "Saved", "missing-query"]) {
  test(`Home persisted archived-only list offers Clear filters with query ${JSON.stringify(query)}`, async () => {
    const view = await fixture([stored("old")], home.DEFAULT_FILTERS, query);
    try {
      assert.deepEqual(view.visible(), []);
      assert.deepEqual(view.choices(), ["Clear filters"]);
      assert.equal(view.query(), query);
      assert.equal(view.createCalls(), 0);
      assert.deepEqual(view.actions, []);
    } finally { await view.close(); }
  });
}

test("Home counts archived workspaces across linked repositories before filtering", async () => {
  const view = await fixture([stored("old-a"), stored("old-b", "b")], home.DEFAULT_FILTERS, "", ["a", "b"]);
  try { assert.deepEqual(view.choices(), ["Clear filters"]); }
  finally { await view.close(); }
});

test("Home Clear filters reveals the persisted archived row without creating or restoring it", async () => {
  const view = await fixture([stored("old")], home.DEFAULT_FILTERS, "Saved");
  try {
    assert.deepEqual(view.choices(), ["Clear filters"]);
    await view.clickEmpty();
    assert.deepEqual(view.saved, [{ projects: [], archiveFilter: "all" }]);
    assert.deepEqual(view.visible(), ["Saved old"]);
    assert.equal(view.query(), "Saved");
    assert.equal(view.createCalls(), 0);
    assert.deepEqual(view.actions, []);
    await view.clickHeader();
    assert.equal(view.createCalls(), 1, "Header Create remains independently available");
  } finally { await view.close(); }
});

test("Home truly empty persisted list still offers Create", async () => {
  const view = await fixture([]);
  try {
    assert.deepEqual(view.choices(), ["Create a workspace"]);
    await view.clickEmpty();
    assert.equal(view.createCalls(), 1);
    assert.deepEqual(view.saved, []);
    assert.deepEqual(view.actions, []);
  } finally { await view.close(); }
});

test("Home does not count archived rows belonging to an unlinked repository", async () => {
  const view = await fixture([stored("orphan", "unlinked")]);
  try { assert.deepEqual(view.choices(), ["Create a workspace"]); }
  finally { await view.close(); }
});

test("Home active query miss still clears filters without changing its query", async () => {
  const view = await fixture([stored("live", "a", "ready")], home.DEFAULT_FILTERS, "missing-query");
  try {
    assert.deepEqual(view.choices(), ["Clear filters"]);
    await view.clickEmpty();
    assert.equal(view.query(), "missing-query");
    assert.deepEqual(view.visible(), []);
    assert.deepEqual(view.choices(), []);
  } finally { await view.close(); }
});

test("Home empty unfiltered all-mode list still has no empty-state action", async () => {
  const view = await fixture([], home.CLEARED_FILTERS);
  try { assert.deepEqual(view.choices(), []); }
  finally { await view.close(); }
});

test("Home empty archived-mode list still offers Clear filters", async () => {
  const view = await fixture([], { projects: [], archiveFilter: "archived" });
  try { assert.deepEqual(view.choices(), ["Clear filters"]); }
  finally { await view.close(); }
});
