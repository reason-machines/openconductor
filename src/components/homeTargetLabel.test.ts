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
const visibleText = (node: TextTree): string =>
  typeof node === "string" ? node : node.children.map(visibleText).join("");

async function fixture(defaultBranch: string, overrides: Partial<DbWorkspaceRow>, query = "") {
  const repository: DbRepoRow = {
    id: "linked-project-a", name: "Project A", rootPath: "/fixture/project-a", remoteUrl: null,
    defaultBranch, displayOrder: 0, hidden: false, icon: null, createdAt: CREATED,
  };
  // Archived rows use their persisted branch in Conductor's UJo, not the live branch cache.
  const stored: DbWorkspaceRow = {
    id: "cairo", repositoryId: repository.id, state: "archived", directoryName: "cairo",
    workspaceName: null, userSetWorkspaceName: false, branch: "develop",
    intendedTargetBranch: "develop", placeholderBranchName: null, derivedStatus: null, manualStatus: null,
    workspacePath: "/fixture/project-a/cairo", pinnedAt: null, unread: false,
    prTitle: null, prDescription: null, number: null, createdAt: CREATED,
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
  if (query) {
    await act(async () => {
      renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onChange({ target: { value: query } });
    });
  }
  return {
    label() {
      const rows = renderer.root.findAllByProps({ role: "option" });
      assert.equal(rows.length, 1, "The archived workspace must render independently of its label");
      const row = rows[0];
      const names = row.findAll((node: { type: unknown; props: { className?: string } }) =>
        node.type === "span" && Boolean(node.props.className?.split(" ").includes("allws-name")));
      assert.equal(names.length, 1);
      return {
        title: row.props.title, text: visibleText(names[0]),
        repositoryContexts: row.findAllByProps({ title: "Project A", "aria-hidden": true }).length,
      };
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const cases: { name: string; defaultBranch: string; overrides: Partial<DbWorkspaceRow>; expected: string; query?: string }[] = [
  { name: "workspace target hides its branch even when the repository default differs", defaultBranch: "main", overrides: {}, expected: "Cairo" },
  { name: "repository default remains visible when it is not the workspace target", defaultBranch: "main", overrides: { branch: "main" }, expected: "Main" },
  { name: "null workspace target uses the decoder's main fallback, not repository default", defaultBranch: "develop", overrides: { branch: "main", intendedTargetBranch: null }, expected: "Cairo" },
  { name: "older workspace row uses the same main fallback", defaultBranch: "develop", overrides: { branch: "main", intendedTargetBranch: undefined }, expected: "Cairo" },
  { name: "matching repository and workspace targets keep directory fallback", defaultBranch: "develop", overrides: {}, expected: "Cairo" },
  { name: "unrelated branch keeps its prettified label", defaultBranch: "main", overrides: { branch: "topic/fix-search" }, expected: "Topic/fix search" },
  { name: "stored name still precedes target and branch", defaultBranch: "main", overrides: { workspaceName: "Stored display" }, expected: "Stored display" },
  { name: "PR title still precedes target and branch", defaultBranch: "main", overrides: { prTitle: "Fix target labels" }, expected: "Fix target labels" },
  { name: "explicit user name still wins", defaultBranch: "main", overrides: { workspaceName: "My workspace", userSetWorkspaceName: true, prTitle: "PR title" }, expected: "My workspace" },
  { name: "search uses the same corrected displayed name", defaultBranch: "main", overrides: { branch: "main" }, expected: "Main", query: "main" },
];

for (const { name, defaultBranch, overrides, expected, query } of cases) {
  test(`Home target label: ${name}`, async () => {
    const view = await fixture(defaultBranch, overrides, query);
    try {
      assert.deepEqual(view.label(), { title: expected, text: expected, repositoryContexts: 1 });
    } finally { await view.close(); }
  });
}
