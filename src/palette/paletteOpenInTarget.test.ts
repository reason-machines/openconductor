import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { ComponentProps } from "react";
import type { AppState, Workspace } from "../state/types.ts";
import type { WorkspaceOpenInTarget } from "./fromAppState.ts";
import * as adapter from "./fromAppState.ts";
import { GIT_PANEL_ACTIONS } from "./gitPanelActions.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const inert = () => null;
const noop = () => {};
const forbidden = () => { throw new Error("Unexpected external operation in palette Open in target fixture"); };
const owner = { repoId: "repo-a", workspaceId: "workspace-a", workspacePath: "/synthetic/workspace-a" };
const workspace: Workspace = { id: owner.workspaceId, name: "Synthetic workspace", branch: "main", status: "idle", path: owner.workspacePath, diff: { added: 0, removed: 0 }, createdAt: 1 };
const seed: AppState = { repos: [{ id: owner.repoId, name: "Synthetic project", path: "/synthetic/project", defaultBranch: "main", workspaces: [workspace] }], selection: { kind: "workspace", repoId: owner.repoId, workspaceId: owner.workspaceId } };
const apps = ["vscode", "finder", "cursor", "terminal", "alacritty", "kaleidoscope"].map((id) => ({ id, name: id, icon: null, iconType: "code" }));
const file = (relativePath: string): WorkspaceOpenInTarget => ({ ...owner, kind: "file", relativePath });

function evaluate(file: string, imports: Readonly<Record<string, unknown>>, exports: object) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(javascript, {
    exports, console, Date,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected ${file} dependency: ${name}`);
      return imports[name];
    },
  });
}

type PaletteProps = ComponentProps<typeof import("./CommandPalette").CommandPalette>;
type HostProps = ComponentProps<typeof import("./PaletteHost").PaletteHost>;

async function fixture(target: WorkspaceOpenInTarget | null = null, state: AppState = seed, fail = false) {
  const calls: unknown[][] = [];
  const errors: unknown[][] = [];
  let palette: PaletteProps | undefined;
  const launch = async (...args: unknown[]) => { calls.push(["launch", ...structuredClone(args)]); if (fail) throw new Error("synthetic launch failure"); };
  const exports: Partial<typeof import("./PaletteHost")> = {};
  evaluate("./PaletteHost.tsx", {
    "./CommandPalette.tsx": { CommandPalette: (props: PaletteProps) => { palette = props; return null; } },
    "../keybindings/KeybindingsProvider.tsx": { useKeybindings: noop },
    "./fromAppState.ts": adapter,
    "../settings/searchIndex": { buildSearchIndex: () => [] },
    "../settings/pages": { settingsGroups: () => [] },
    "../settings/SettingsView": { AGENT_SEARCH_TABS: [], scrollToRow: forbidden, searchIcon: inert },
    "../features/chat/ChatModelPicker": { openAgentSettings: forbidden, openRepoSettingsPage: forbidden, openSettingsPage: forbidden },
    "../settings/useBoolPref.ts": { useBoolPref: () => false },
    "./recentWorkspaces.ts": { loadRecentWorkspaceIds: () => [], saveRecentWorkspaceIds: noop, recordViewedWorkspace: (ids: string[]) => ids },
    "./settingsRepository.ts": { loadLastWorkspaceRoute: () => null, selectedWorkspaceRoute: () => null, saveLastWorkspaceRoute: noop, settingsRepositoryId: forbidden },
    "../workspace/archive": { listArchivedWorkspaces: async () => [] },
    "../state/nextUnread.ts": { openNextUnread: forbidden },
    "./projectWorkspace.ts": { preferredProjectWorkspace: forbidden },
    "../features/openIn/OpenInButton.tsx": { AppIcon: inert, useInstalledApps: () => apps },
    "../features/openIn/apps.ts": { openInApp: launch },
    "../settings/appPrefs.ts": { recordOpenIn: async (...args: unknown[]) => { calls.push(["record", ...args]); }, useAppPrefs: () => ({ default_open_in: "vscode" }) },
    "../components/Toast": { Toaster: inert, useToasts: () => ({ toasts: [], show: (...args: unknown[]) => errors.push(args), dismiss: noop }) },
    "../components/ConductorIcon": { ConductorIcon: inert },
    "./gitPanelActions.ts": { GIT_PANEL_ACTIONS, requestGitPanelAction: forbidden },
  }, exports);
  const Host = exports.PaletteHost;
  assert.ok(Host);
  const commands = { addProject: forbidden, toggleTheme: forbidden, toggleLeftSidebar: forbidden, toggleRightSidebar: forbidden, toggleZenMode: forbidden, sendFeedback: forbidden, submitPrompt: forbidden, showShortcuts: forbidden, openChangelog: forbidden, openSettings: forbidden, openDocs: forbidden, quickOpen: forbidden, copyUrl: forbidden };
  let props: HostProps = { state, collapsedSections: new Set(), dispatch: forbidden, onOpenDialog: forbidden, onOpenProject: forbidden, open: true, onOpenChange: noop, commands, activeOpenInTarget: target };
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(Host, props)); });
  const current = () => { assert.ok(palette); return palette; };
  return {
    calls, errors,
    rows: () => current().data.actions.filter((entry) => entry.group === "open-in"),
    async choose(appId = "vscode") {
      const action = current().data.actions.find((entry) => entry.id === `open-in-${appId}`);
      assert.ok(action);
      const previous = calls.length;
      await act(async () => current().onSelect({ kind: "action", id: `action:${action.id}`, action }));
      assert.equal(calls.length - previous, 2, "each choice records once then launches once");
      assert.deepEqual(calls[previous], ["record", appId, false]);
      assert.equal(calls[previous + 1]?.[0], "launch");
    },
    async update(next: Partial<HostProps>) { props = { ...props, ...next }; await act(async () => renderer.update(React.createElement(Host, props))); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

for (const relativePath of ["src/selected.ts", "docs/selected.md"]) {
  test(`actual palette host opens the active file ${relativePath} inside its workspace`, async () => {
    const view = await fixture(file(relativePath));
    try {
      await view.choose();
      assert.deepEqual(view.calls, [["record", "vscode", false], ["launch", "vscode", `${owner.workspacePath}/${relativePath}`, { workspacePath: owner.workspacePath }]]);
    } finally { await view.close(); }
  });
}

test("actual palette host preserves exact folder payload without an active file", async () => {
  for (const target of [null, { ...owner, kind: "workspace" } satisfies WorkspaceOpenInTarget]) {
    const view = await fixture(target);
    try { await view.choose(); assert.deepEqual(view.calls[1], ["launch", "vscode", owner.workspacePath]); }
    finally { await view.close(); }
  }
});

test("another workspace, repository or root cannot supply the file target", async () => {
  for (const target of [{ ...file("src/a.ts"), workspaceId: "workspace-other" }, { ...file("src/a.ts"), repoId: "repo-other" }, { ...file("src/a.ts"), workspacePath: "/synthetic/old-root" }]) {
    const view = await fixture(target);
    try { await view.choose(); assert.deepEqual(view.calls[1], ["launch", "vscode", owner.workspacePath]); }
    finally { await view.close(); }
  }
});

test("closed or hidden file publication restores the exact workspace launch", async () => {
  const view = await fixture(file("src/a.ts"));
  try {
    await view.update({ activeOpenInTarget: { ...owner, kind: "workspace" } });
    await view.choose();
    assert.deepEqual(view.calls[1], ["launch", "vscode", owner.workspacePath]);
  } finally { await view.close(); }
});

test("folder-only apps keep the workspace directory rather than the file parent", async () => {
  for (const appId of ["terminal", "alacritty", "kaleidoscope"]) {
    const view = await fixture(file("src/deep/a.ts"));
    try { await view.choose(appId); assert.deepEqual(view.calls[1], ["launch", appId, owner.workspacePath]); }
    finally { await view.close(); }
  }
});

test("Finder gets existing file context; other file-capable editors remain context-free", async () => {
  for (const appId of ["finder", "cursor"]) {
    const view = await fixture(file("src/a.ts"));
    try {
      await view.choose(appId);
      const expected = ["launch", appId, `${owner.workspacePath}/src/a.ts`];
      assert.deepEqual(view.calls[1], appId === "finder" ? [...expected, { workspacePath: owner.workspacePath }] : expected);
    } finally { await view.close(); }
  }
});

test("invalid relative publication cannot broaden the workspace path", async () => {
  for (const path of ["", "/absolute.ts", "../outside.ts", "src/../outside.ts", "./file.ts", "src//file.ts", "src/", "bad\0name.ts"]) {
    const view = await fixture(file(path));
    try { await view.choose(); assert.deepEqual(view.calls[1], ["launch", "vscode", owner.workspacePath]); }
    finally { await view.close(); }
  }
});

test("root changes do not reuse an old publication even with the same workspace id", async () => {
  const view = await fixture(file("src/a.ts"));
  try {
    const path = "/synthetic/replaced-root";
    await view.update({ state: { ...seed, repos: [{ ...seed.repos[0], workspaces: [{ ...workspace, path }] }] } });
    await view.choose();
    assert.deepEqual(view.calls[1], ["launch", "vscode", path]);
  } finally { await view.close(); }
});

test("a launch error reports once without retrying the workspace folder", async () => {
  const view = await fixture(file("src/a.ts"), seed, true);
  try {
    await view.choose();
    assert.equal(view.calls.filter((call) => call[0] === "launch").length, 1);
    assert.equal(view.errors.length, 1);
    assert.equal(view.errors[0][0], "error");
    assert.match(String(view.errors[0][1]), /Failed to open in vscode:.*synthetic launch failure/);
  } finally { await view.close(); }
});

test("same workspace ids in sibling repositories resolve only the selected repository", async () => {
  const path = "/synthetic/workspace-b";
  const state: AppState = {
    ...seed,
    repos: [
      { ...seed.repos[0], workspaces: [{ ...workspace, status: "archived" }] },
      { ...seed.repos[0], id: "repo-b", workspaces: [{ ...workspace, path }] },
    ],
    selection: { kind: "workspace", repoId: "repo-b", workspaceId: workspace.id },
  };
  const view = await fixture({ ...file("src/a.ts"), repoId: "repo-b", workspacePath: path }, state);
  try {
    await view.choose();
    assert.deepEqual(view.calls, [["record", "vscode", false], ["launch", "vscode", `${path}/src/a.ts`, { workspacePath: path }]]);
  } finally { await view.close(); }
});

test("archived, pathless and root selections still have no launch row", async () => {
  const states: AppState[] = [
    { ...seed, selection: { kind: "root" } },
    { ...seed, repos: [{ ...seed.repos[0], workspaces: [{ ...workspace, status: "archived" }] }] },
    { ...seed, repos: [{ ...seed.repos[0], workspaces: [{ ...workspace, path: undefined }] }] },
  ];
  for (const state of states) {
    const view = await fixture(file("src/a.ts"), state);
    try { assert.equal(view.rows().length, 0); assert.deepEqual(view.calls, []); }
    finally { await view.close(); }
  }
});
