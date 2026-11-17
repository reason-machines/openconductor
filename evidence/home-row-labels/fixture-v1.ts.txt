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
type TextTree = string | { children: readonly TextTree[] };

function visibleText(node: TextTree): string {
  return typeof node === "string" ? node : node.children.map(visibleText).join("");
}

async function fixture(overrides: Partial<DbWorkspaceRow>) {
  const repository: DbRepoRow = {
    id: "linked-project-a", name: "Project A", rootPath: "/fixture/project-a", remoteUrl: null,
    defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: CREATED,
  };
  const stored: DbWorkspaceRow = {
    id: "cairo", repositoryId: repository.id, state: "archived", directoryName: "cairo",
    workspaceName: "Stored display", userSetWorkspaceName: false, branch: "topic/different-name",
    intendedTargetBranch: "main", placeholderBranchName: null, derivedStatus: null, manualStatus: null,
    workspacePath: "/fixture/project-a/cairo", pinnedAt: null, unread: false,
    prTitle: "Pull request title", prDescription: null, number: null, createdAt: CREATED,
    ...overrides,
  };
  const repos = reposFromDb([repository], [stored], []);
  const archived = archivedFromRows([stored]);
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "archived" }), saveFilters() {} },
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
  return {
    label() {
      const rows = renderer.root.findAllByProps({ role: "option" });
      assert.equal(rows.length, 1, "The archived workspace must render independently of its label");
      const row = rows[0];
      const names = row.findAll((node: { type: unknown; props: { className?: string } }) =>
        node.type === "span" && Boolean(node.props.className?.split(" ").includes("allws-name")));
      assert.equal(names.length, 1);
      const repositoryContexts = row.findAllByProps({ title: "Project A", "aria-hidden": true });
      return { title: row.props.title, text: visibleText(names[0]), repositoryContexts: repositoryContexts.length };
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const cases: { name: string; overrides: Partial<DbWorkspaceRow>; expected: string }[] = [
  { name: "stored name precedes PR title", overrides: {}, expected: "Stored display" },
  { name: "stored name precedes branch", overrides: { prTitle: null }, expected: "Stored display" },
  { name: "explicit user name remains first", overrides: { userSetWorkspaceName: true }, expected: "Stored display" },
  { name: "null stored name falls through to PR title", overrides: { workspaceName: null }, expected: "Pull request title" },
  { name: "null stored name falls through to branch", overrides: { workspaceName: null, prTitle: null }, expected: "Topic/different name" },
  { name: "null stored name and target branch fall through to directory", overrides: { workspaceName: null, prTitle: null, branch: "main" }, expected: "Cairo" },
];

for (const { name, overrides, expected } of cases) {
  test(`Home row label: ${name}`, async () => {
    const view = await fixture(overrides);
    try {
      assert.deepEqual(view.label(), { title: expected, text: expected, repositoryContexts: 1 });
    } finally { await view.close(); }
  });
}
