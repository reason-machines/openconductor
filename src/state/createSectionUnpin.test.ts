import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import * as React from "react";
import ts from "typescript";
import type { Action } from "./store";
import type { AppState } from "./types";
import type { DbRepoRow, DbWorkspaceRow } from "./persisted";
import * as navigationSections from "./navigationSections.ts";
import * as sidebarPersistence from "./sidebarPersist.ts";

const dependencies = createRequire(import.meta.url);
const { act, create } = dependencies("react-test-renderer");
const emptyPrefs = {};
const pinnedAt = "2026-01-01 00:00:00";
const seed: AppState = {
  selection: { kind: "workspace", repoId: "synthetic-repo", workspaceId: "synthetic-workspace" },
  repos: [{ id: "synthetic-repo", name: "Synthetic project", path: "/synthetic/not-an-open-target", defaultBranch: "main", workspaces: [
    { id: "synthetic-workspace", name: "Moved", branch: "fixture", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, pinnedAt: 10 },
    { id: "other-workspace", name: "Unrelated", branch: "other", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 2, pinnedAt: 20 },
  ] }],
  sections: [{ id: "previous", name: "Previous", workspaceIds: ["synthetic-workspace"] }],
};
const createAction = { type: "createSection", section: { id: "new-section", name: "New", workspaceIds: ["synthetic-workspace"] } } satisfies Action;

function evaluate(file: string, imports: Readonly<Record<string, unknown>>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, unknown> = {};
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(javascript, {
    ...globals, exports, console, URLSearchParams,
    require(name: string) {
      if (name === "react" || name === "react/jsx-runtime") return dependencies(name);
      assert.ok(name in imports, `Unexpected ${file} dependency: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function actualStore(globals: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const imports: Record<string, unknown> = {};
  for (const name of ["@tauri-apps/api/core", "./names", "./selectors", "../backend", "./repoOrder", "./persisted", "./sidebarOrder", "./nextUnread", "./chatUnread", "./addRepo", "../workspace/archive", "../scripts/api", "../scripts/model", "../workspace/setupWatch", "../settings/appPrefs"]) imports[name] = {};
  imports["./navigationSections"] = navigationSections;
  imports["./sidebarPersist"] = sidebarPersistence;
  Object.assign(imports, overrides);
  const exports = evaluate("./store.ts", imports, globals);
  const reducer = exports.reducer;
  const useAppStore = exports.useAppStore;
  assert.equal(typeof reducer, "function");
  assert.equal(typeof useAppStore, "function");
  return {
    reducer: reducer as typeof import("./store").reducer,
    useAppStore: useAppStore as typeof import("./store").useAppStore,
  };
}

test("section creation unpins its captured workspace without changing unrelated pins or old section membership", () => {
  const { reducer } = actualStore();
  const next = reducer(seed, createAction);
  assert.equal(next.repos[0].workspaces[0].pinnedAt, undefined);
  assert.equal(next.repos[0].workspaces[1].pinnedAt, 20);
  assert.equal(next.sections?.find((section) => section.id === "previous")?.workspaceIds.includes("synthetic-workspace"), false);
  assert.equal(next.sections?.find((section) => section.id === "new-section")?.workspaceIds[0], "synthetic-workspace");
  assert.equal(seed.repos[0].workspaces[0].pinnedAt, 10, "the input state is not mutated");
});

test("removing a workspace after section creation does not resurrect its previous pin", () => {
  const { reducer } = actualStore();
  const created = reducer(seed, createAction);
  const removed = reducer(created, { type: "assignSection", workspaceId: "synthetic-workspace", sectionId: null });
  assert.equal(removed.repos[0].workspaces[0].pinnedAt, undefined);
  assert.ok(removed.sections?.every((section) => !section.workspaceIds.includes("synthetic-workspace")));
});

test("plain section creation preserves every existing pin", () => {
  const { reducer } = actualStore();
  const next = reducer(seed, { type: "createSection", section: { id: "empty", name: "Empty", workspaceIds: [] } });
  assert.equal(next.repos[0].workspaces[0].pinnedAt, 10);
  assert.equal(next.repos[0].workspaces[1].pinnedAt, 20);
  assert.equal(next.sections?.find((section) => section.id === "empty")?.workspaceIds.length, 0);
});

async function desktopFixture(acceptLayout = true) {
  const repo: DbRepoRow = { id: "synthetic-repo", name: "Synthetic project", rootPath: "/synthetic/not-an-open-target", remoteUrl: null, defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, createdAt: pinnedAt };
  let workspace: DbWorkspaceRow = { id: "synthetic-workspace", repositoryId: repo.id, directoryName: "fixture", workspaceName: "Moved", branch: "fixture", placeholderBranchName: null, state: "ready", derivedStatus: null, manualStatus: null, workspacePath: null, pinnedAt, unread: false, prTitle: null, prDescription: null, number: null, createdAt: pinnedAt };
  let layout = { sections: [{ id: "previous", name: "Previous", emoji: null, workspaceIds: [workspace.id] }], updatedAt: 1 };
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  let failed = false;
  let errorCalls = 0;
  const invoke = async (command: string, args: Record<string, unknown> = {}) => {
    calls.push({ command, args });
    if (command === "db_list_repos") return [repo];
    if (command === "db_list_workspaces") return [workspace];
    if (command === "db_read_navigation_sections") return layout;
    if (command === "db_write_navigation_sections") {
      if (!acceptLayout) { failed = true; throw new Error("Synthetic rejected layout write"); }
      const sections = args.sections;
      assert.ok(Array.isArray(sections));
      layout = { sections, updatedAt: Number(args.updatedAt) };
      return true;
    }
    if (command === "db_set_workspace_pinned") {
      assert.equal(args.workspaceId, workspace.id);
      assert.equal(args.pinned, false);
      assert.equal(failed, false, "a rejected creation must not unpin its workspace");
      workspace = { ...workspace, pinnedAt: null };
      return null;
    }
    throw new Error(`Unexpected operation in inert store fixture: ${command}`);
  };
  const persisted = evaluate("./persisted.ts", {
    "./workspaceStatus.ts": { isWorkspaceStatus: () => false },
    "../home/sidebarGroupBy.ts": { parseStatusCollapsed: () => undefined },
    "./openChat.ts": { restoreChatTabs: () => {} },
  });
  const window = Object.assign(new EventTarget(), { location: { pathname: "/", search: "" } });
  const storage = new Map<string, string>();
  const store = actualStore({ window, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } }, {
    "@tauri-apps/api/core": { invoke },
    "../backend": { inTauri: () => true },
    "./persisted": persisted,
    "./selectors": { startSelection: (value: AppState) => value },
    "../settings/appPrefs": { useAppPrefs: () => emptyPrefs },
  });
  let state: AppState | undefined;
  let dispatch: React.Dispatch<Action> | undefined;
  let startup: string | undefined;
  function Probe() {
    const current = store.useAppStore();
    state = current[0]; dispatch = current[1]; startup = current[2];
    return null;
  }
  const mount = async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(startup, "ready");
    return renderer;
  };
  let renderer = await mount();
  return {
    calls,
    state() { assert.ok(state); return state; },
    persistedPin: () => workspace.pinnedAt,
    errors: () => errorCalls,
    async dispatch(action: Action) { assert.ok(dispatch); await act(async () => { dispatch?.(action); }); },
    createAction(): Action { return { ...createAction, onError: () => { errorCalls += 1; } }; },
    async remount() { await act(async () => renderer.unmount()); renderer = await mount(); },
    async close() { await act(async () => renderer.unmount()); },
  };
}

test("actual desktop store persists creation's unpin and keeps it after remove and hydration", async () => {
  const view = await desktopFixture();
  try {
    await view.dispatch(view.createAction());
    assert.equal(view.persistedPin(), null, "creation must write the unpin, not merely hide a pinned row in the section");
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, undefined);
    assert.equal(view.calls.filter((call) => call.command === "db_set_workspace_pinned").length, 1);
    await view.dispatch({ type: "assignSection", workspaceId: "synthetic-workspace", sectionId: null });
    await view.remount();
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, undefined);
    assert.ok(view.state().sections?.every((section) => !section.workspaceIds.includes("synthetic-workspace")));
    assert.equal(view.errors(), 0);
  } finally { await view.close(); }
});

test("actual desktop plain creation writes no unpin", async () => {
  const view = await desktopFixture();
  try {
    await view.dispatch({ type: "createSection", section: { id: "empty", name: "Empty", workspaceIds: [] } });
    assert.equal(view.persistedPin(), pinnedAt);
    assert.equal(view.calls.some((call) => call.command === "db_set_workspace_pinned"), false);
    assert.equal(view.state().sections?.some((section) => section.id === "empty"), true);
  } finally { await view.close(); }
});

test("rejected section creation does not persist an unpin and preserves its existing error callback", async () => {
  const view = await desktopFixture(false);
  try {
    await view.dispatch(view.createAction());
    assert.equal(view.persistedPin(), pinnedAt);
    assert.equal(view.calls.some((call) => call.command === "db_set_workspace_pinned"), false);
    assert.equal(view.errors(), 1);
    assert.equal(view.state().sections?.some((section) => section.id === "new-section"), false);
    assert.equal(view.state().repos[0].workspaces[0].pinnedAt, Date.parse("2026-01-01T00:00:00Z"));
  } finally { await view.close(); }
});
