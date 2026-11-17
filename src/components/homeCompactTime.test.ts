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

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
type TextTree = string | { children: readonly TextTree[] };
const visibleText = (node: TextTree): string => typeof node === "string" ? node : node.children.map(visibleText).join("");

async function mount(at: number, now: number) {
  const repository: DbRepoRow = {
    id: "project-a", name: "Project A", rootPath: "/fixture/project-a", remoteUrl: null,
    defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: new Date(at).toISOString(),
  };
  const stored: DbWorkspaceRow = {
    id: "cairo", repositoryId: repository.id, state: "ready", directoryName: "cairo",
    workspaceName: "Cairo", userSetWorkspaceName: true, branch: "topic/cairo",
    intendedTargetBranch: "main", placeholderBranchName: null, derivedStatus: null, manualStatus: null,
    workspacePath: "/fixture/project-a/cairo", pinnedAt: null, unread: false,
    prTitle: null, prDescription: null, number: null, createdAt: new Date(at).toISOString(),
  };
  const repos = reposFromDb([repository], [stored], []);
  const inert = () => null;
  const imports: Record<string, unknown> = {
    "../home/allWorkspaces": { ...home, loadFilters: () => ({ projects: [], archiveFilter: "active" }), saveFilters() {} },
    "../state/rowStatus": status,
    "../state/workspaceNumber": { workspaceNumberLabel },
    "../state/chatUnread": { isWorkspaceUnread: () => false },
    "../features/chat/useWorkspaceSession": { useWorkspaceAgentStatus: () => "idle" },
    "../settings/useStatusMatrix": { useStatusMatrix: () => true },
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
  class Clock extends Date { static now() { return now; } }
  const exported: Partial<Pick<typeof import("./AllWorkspaces"), "AllWorkspaces">> = {};
  const javascript = ts.transpileModule(readFileSync(new URL("./AllWorkspaces.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    exports: exported, window: new EventTarget(), Date: Clock,
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
    text() {
      const rows = renderer.root.findAllByProps({ role: "option" });
      assert.equal(rows.length, 1, "Workspace must be present independently of its timestamp");
      assert.equal(rows[0].props.title, "Cairo");
      const times = rows[0].findAllByProps({ className: "allws-when" });
      assert.equal(times.length, 1);
      return visibleText(times[0]);
    },
    async close() { await act(async () => { renderer.unmount(); }); },
  };
}

const cases = [
  { name: "spring local-clock boundary", zone: "America/New_York", at: "2026-03-08T01:00:00-05:00", now: "2026-03-08T04:00:00-04:00", expected: "3h" },
  { name: "fall local-clock boundary", zone: "America/New_York", at: "2026-11-01T00:30:00-04:00", now: "2026-11-01T02:30:00-05:00", expected: "2h" },
  { name: "leap-day full year at February end", zone: "UTC", at: "2024-02-29T12:00:00Z", now: "2025-02-28T12:00:00Z", expected: "1y" },
  { name: "year boundary before full month clock time", zone: "UTC", at: "2025-01-01T13:00:00Z", now: "2026-01-01T12:00:00Z", expected: "12mo" },
  { name: "ordinary same-offset hours control", zone: "America/New_York", at: "2026-03-07T01:00:00-05:00", now: "2026-03-07T04:00:00-05:00", expected: "3h" },
  { name: "complete ordinary year control", zone: "UTC", at: "2025-01-01T12:00:00Z", now: "2026-01-01T12:00:00Z", expected: "1y" },
] as const;

for (const entry of cases) {
  test(`Home compact time: ${entry.name}`, async () => {
    const previous = process.env.TZ;
    process.env.TZ = entry.zone;
    try {
      const view = await mount(Date.parse(entry.at), Date.parse(entry.now));
      try { assert.equal(view.text(), entry.expected); }
      finally { await view.close(); }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}
