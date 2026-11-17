import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import { closedArchiveFilterFixture } from "../../evidence/home-archive-select-keyboard/closedArchiveFilterFixture.ts";
import ts from "typescript";
import { reposFromDb, type DbRepoRow, type DbWorkspaceRow } from "../state/persisted.ts";
import * as home from "../home/allWorkspaces.ts";
import * as status from "../state/rowStatus.ts";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const CREATED = "2026-11-11T12:00:00Z";
type TextTree = string | { children: readonly TextTree[] };
const text = (node: TextTree): string => typeof node === "string" ? node : node.children.map(text).join("");

async function fixture(name: string, query: string) {
  const storedRepo: DbRepoRow = {
    id: "local-project", name: "Local project", rootPath: "/fixture/project", remoteUrl: null,
    defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: CREATED,
  };
  // An explicitly stored local name wins before PR/live-branch/target formatting in UJo -> $V.
  const stored: DbWorkspaceRow = {
    id: "local-workspace", repositoryId: storedRepo.id, state: "ready", directoryName: "cairo",
    workspaceName: name, userSetWorkspaceName: true, branch: "topic/example", intendedTargetBranch: "main",
    placeholderBranchName: null, derivedStatus: null, manualStatus: null,
    workspacePath: "/fixture/project/cairo", pinnedAt: null, unread: false,
    prTitle: null, prDescription: null, number: 12, createdAt: CREATED,
  };
  const repos = reposFromDb([storedRepo], [stored], []);
  const before = JSON.stringify(repos);
  const actions: unknown[] = [];
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => false },
    "../settings/useBoolPref": { useBoolPref: () => true },
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
      repos, sidebarVisible: true, dispatch: (action: unknown) => actions.push(action), onCreateWorkspace() {},
    }));
  });
  await act(async () => {
    renderer.root.findByProps({ "aria-label": "Search workspaces" }).props.onChange({ target: { value: query } });
  });
  return {
    snapshot() {
      const rows = renderer.root.findAllByProps({ role: "option" });
      assert.equal(rows.length, 1, "Matching membership must not depend on highlight offsets");
      const row = rows[0];
      const label = row.findAll((node: { type: unknown; props: { className?: string } }) =>
        node.type === "span" && Boolean(node.props.className?.split(" ").includes("allws-name")))[0];
      assert.ok(label);
      assert.equal(JSON.stringify(repos), before, "Highlight rendering must not mutate persisted data");
      assert.deepEqual(actions, []);
      return { title: row.props.title, text: text(label), highlighted: label.findAllByType("mark").map(text).join("") };
    },
    async close() { await act(async () => renderer.unmount()); },
  };
}

const cases = [
  { name: "plain ASCII", label: "Launch ready", query: "launch", highlighted: "Launch" },
  { name: "BMP prefix", label: "é launch ready", query: "launch", highlighted: "launch" },
  { name: "astral prefix", label: "🚀 launch ready", query: "launch", highlighted: "launch" },
  { name: "two astral prefixes", label: "🚀🧭 launch ready", query: "launch", highlighted: "launch" },
  { name: "emoji query", label: "🚀 launch ready", query: "🚀", highlighted: "🚀" },
  { name: "multiword after emoji", label: "🚀 launch ready", query: "launch ready", highlighted: "launchready" },
  { name: "emoji after match", label: "Launch 🚀 ready", query: "launch", highlighted: "Launch" },
  { name: "uppercase query after emoji", label: "🚀 launch ready", query: "LAUNCH", highlighted: "launch" },
  { name: "empty query preserves complete Unicode label", label: "🚀 launch ready", query: "", highlighted: "" },
  { name: "branch-only match leaves displayed name unmarked", label: "🚀 launch ready", query: "example", highlighted: "" },
];

for (const item of cases) {
  test(`Home search Unicode: ${item.name}`, async () => {
    const view = await fixture(item.label, item.query);
    try { assert.deepEqual(view.snapshot(), { title: item.label, text: item.label, highlighted: item.highlighted }); }
    finally { await view.close(); }
  });
}
