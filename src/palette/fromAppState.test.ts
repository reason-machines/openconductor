import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppState, Workspace } from "../state/types.ts";
import { paletteDataFromState, sidebarOrder, stepWorkspace } from "./fromAppState.ts";
import { buildResults } from "./search/model.ts";

const w = (id: string, createdAt: number): Workspace => ({
  id,
  name: id,
  branch: `b-${id}`,
  status: "idle",
  diff: { added: 0, removed: 0 },
  createdAt,
});
const state: AppState = {
  repos: [
    { id: "r1", name: "openconductor", path: "", defaultBranch: "main", workspaces: [w("a", 1), w("b", 2)] },
    { id: "r2", name: "api", path: "", defaultBranch: "main", workspaces: [w("c", 3)] },
  ],
  selection: { kind: "workspace", repoId: "r1", workspaceId: "b" },
};

test("sidebar order spans repos in order", () => {
  assert.deepEqual(
    sidebarOrder(state).map((x) => x.workspace.id),
    ["a", "b", "c"],
  );
});

test("stepping wraps and starts at the ends when nothing is selected", () => {
  assert.equal(stepWorkspace(state, 1)?.workspace.id, "c");
  assert.equal(stepWorkspace({ ...state, selection: { kind: "workspace", repoId: "r2", workspaceId: "c" } }, 1)?.workspace.id, "a");
  assert.equal(stepWorkspace({ ...state, selection: { kind: "home" } }, -1)?.workspace.id, "c");
  assert.equal(stepWorkspace({ repos: [], selection: { kind: "home" } }, 1), undefined);
});

test("recents drop unknown ids and outrank creation time in the Workspaces tab", () => {
  const data = paletteDataFromState(state, ["a", "gone"]);
  assert.deepEqual(data.recentWorkspaceIds, ["a"]);
  assert.equal(data.activeWorkspaceId, "b");
  const order = buildResults("workspaces", "", data)[0].items.map((i) => i.id);
  assert.deepEqual(order, ["workspace:a", "workspace:c", "workspace:b"]);
});

test("workspace actions appear only with a workspace selected", () => {
  const headings = (s: AppState) => buildResults("all", "", paletteDataFromState(s, [])).map((g) => g.heading);
  assert.ok(headings(state).includes("Workspace actions"));
  assert.ok(!headings({ ...state, selection: { kind: "home" } }).includes("Workspace actions"));
});
