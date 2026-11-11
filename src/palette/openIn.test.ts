import { test } from "node:test";
import assert from "node:assert/strict";
import { paletteDataFromState } from "./fromAppState.ts";
import { buildResults } from "./search/model.ts";
import type { AppState, Workspace } from "../state/types.ts";

const workspace: Workspace = { id: "w", name: "w", branch: "main", status: "idle", path: "/invented/workspace", diff: { added: 0, removed: 0 }, createdAt: 1 };
const state: AppState = { repos: [{ id: "r", name: "repo", path: "/invented/repo", defaultBranch: "main", workspaces: [workspace] }], selection: { kind: "workspace", repoId: "r", workspaceId: "w" } };
const apps = [{ id: "finder", name: "Finder" }, { id: "vscode", name: "VS Code" }, { id: "terminal", name: "Terminal" }];
const data = (s = state) => paletteDataFromState(s, [], [], [], apps, "vscode");

test("palette offers installed apps in catalog order with the saved app shortcut", () => {
  const items = buildResults("actions", "", data()).find((g) => g.id === "open-in")?.items;
  assert.deepEqual(items?.map((i) => i.kind === "action" ? [i.action.id, i.action.title, i.action.bindingId] : null), [
    ["open-in-finder", "Finder", undefined], ["open-in-vscode", "VS Code", "workspace.openInApp"], ["open-in-terminal", "Terminal", undefined],
  ]);
});

test("Open in searches by app name and open-in keywords, but never appears in Settings or Projects", () => {
  assert.equal(buildResults("all", "vs code", data()).find((g) => g.id === "open-in")?.items[0]?.id, "action:open-in-vscode");
  assert.equal(buildResults("actions", "open in", data()).find((g) => g.id === "open-in")?.items.length, 3);
  for (const tab of ["settings", "projects", "workspaces"] as const) assert.equal(buildResults(tab, "", data()).some((g) => g.id === "open-in"), false);
});

test("no app launch rows without a live workspace path", () => {
  const withWorkspace = (w: Workspace): AppState => ({ ...state, repos: [{ ...state.repos[0], workspaces: [w] }] });
  for (const s of [{ ...state, selection: { kind: "root" } } satisfies AppState, withWorkspace({ ...workspace, status: "archived" }), withWorkspace({ ...workspace, path: undefined })]) {
    assert.equal(data(s).actions.some((a) => a.group === "open-in"), false);
  }
});
