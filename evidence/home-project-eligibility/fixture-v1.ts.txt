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

function repo(id: string): DbRepoRow {
  return {
    id, name: `Project ${id.toUpperCase()}`, rootPath: `/fixture/${id}`, remoteUrl: null,
    defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: CREATED,
  };
}

function workspace(id: string, repositoryId: string, state: "ready" | "archived"): DbWorkspaceRow {
  return {
    id, repositoryId, state, directoryName: id, workspaceName: id, userSetWorkspaceName: true,
    branch: id, placeholderBranchName: null, derivedStatus: null, manualStatus: null,
    workspacePath: `/fixture/${repositoryId}/${id}`, pinnedAt: null, unread: false,
    prTitle: null, prDescription: null, number: null, createdAt: CREATED,
  };
}

async function fixture(workspaces: DbWorkspaceRow[], archiveFilter: home.ArchiveFilter = "archived") {
  const repos = reposFromDb([repo("a"), repo("b"), repo("empty")], workspaces, []);
  const archived = archivedFromRows(workspaces);
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter }), saveFilters() {} },
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
  const { AllWorkspaces } = exported;
  assert.ok(AllWorkspaces);
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(AllWorkspaces, {
      repos, sidebarVisible: true, dispatch(_action: Action) {}, onCreateWorkspace() {},
    }));
  });
  const projectButtons = () => renderer.root.findAllByProps({ "aria-label": "Projects" });
  return {
    rows: () => renderer.root.findAllByProps({ role: "option" }).map((row: { props: { title: string } }) => row.props.title),
    projectControlCount: () => projectButtons().length,
    async choices() {
      const buttons = projectButtons();
      assert.equal(buttons.length, 1, "Projects must be available for both represented repositories");
      await act(async () => { buttons[0].props.onClick(); });
      return renderer.root.findAllByProps({ role: "menuitemcheckbox" }).map((item: { children: unknown[] }) => item.children.filter((child) => typeof child === "string").join(""));
    },
    async selectProject(label: string) {
      const choices: { children: unknown[]; props: { onClick(): void } }[] = renderer.root.findAllByProps({ role: "menuitemcheckbox" });
      const item = choices.find((choice) => choice.children.includes(label));
      assert.ok(item, label);
      await act(async () => { item.props.onClick(); });
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

test("Home Projects includes two archived-only linked repositories in Only archived", async () => {
  const view = await fixture([workspace("A archived", "a", "archived"), workspace("B archived", "b", "archived")]);
  try {
    assert.deepEqual(view.rows().sort(), ["A archived", "B archived"]);
    assert.deepEqual(await view.choices(), ["All projects", "Project A", "Project B"]);
    await view.selectProject("Project B");
    assert.deepEqual(view.rows(), ["B archived"]);
  } finally { await view.close(); }
});

test("Home Projects includes an archived-only repository beside a live repository", async () => {
  const view = await fixture([workspace("A live", "a", "ready"), workspace("B archived", "b", "archived")], "all");
  try {
    assert.deepEqual(view.rows().sort(), ["A live", "B archived"]);
    assert.deepEqual(await view.choices(), ["All projects", "Project A", "Project B"]);
  } finally { await view.close(); }
});

test("Home Projects eligibility does not disappear when archived rows are hidden", async () => {
  const view = await fixture([workspace("A archived", "a", "archived"), workspace("B archived", "b", "archived")], "active");
  try {
    assert.deepEqual(view.rows(), []);
    assert.deepEqual(await view.choices(), ["All projects", "Project A", "Project B"]);
  } finally { await view.close(); }
});

test("Home Projects live-only choices preserve repository order and omit an empty repository", async () => {
  const view = await fixture([workspace("B live", "b", "ready"), workspace("A live", "a", "ready")], "active");
  try {
    assert.deepEqual(view.rows().sort(), ["A live", "B live"]);
    assert.deepEqual(await view.choices(), ["All projects", "Project A", "Project B"]);
  } finally { await view.close(); }
});

test("Home Projects stays absent for multiple archived workspaces in one repository", async () => {
  const view = await fixture([workspace("A first", "a", "archived"), workspace("A second", "a", "archived")]);
  try {
    assert.deepEqual(view.rows().sort(), ["A first", "A second"]);
    assert.equal(view.projectControlCount(), 0);
  } finally { await view.close(); }
});

test("Home Projects stays absent for one live repository", async () => {
  const view = await fixture([workspace("A live", "a", "ready")], "active");
  try {
    assert.deepEqual(view.rows(), ["A live"]);
    assert.equal(view.projectControlCount(), 0);
  } finally { await view.close(); }
});

test("Home Projects ignores archived rows from closed repositories", async () => {
  const view = await fixture([workspace("A archived", "a", "archived"), workspace("Closed archived", "closed", "archived")]);
  try {
    assert.deepEqual(view.rows(), ["A archived"]);
    assert.equal(view.projectControlCount(), 0);
  } finally { await view.close(); }
});
