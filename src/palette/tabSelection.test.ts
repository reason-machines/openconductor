import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResults, type PaletteData, type PaletteTab } from "./search/model.ts";
import { moveActive, tabSelectionIndex } from "./state.ts";

const data: PaletteData = {
  workspaces: [],
  projects: [{ id: "alpha", name: "Alpha" }, { id: "beta", name: "Beta" }],
  actions: [{ id: "new", title: "New workspace", group: "actions" }],
  settings: [],
  recentWorkspaceIds: [],
  activeWorkspaceId: null,
};
const results = (tab: PaletteTab, query = "") => buildResults(tab, query, data).flatMap((group) => group.items);

test("All to Projects keeps the second selected project for Enter activation", () => {
  const all = results("all", "a");
  const projects = results("projects", "a");
  const selected = all.find((item) => item.id === "project:beta");
  assert.ok(selected);
  const active = tabSelectionIndex({ from: "all", to: "projects", selected, results: projects });
  assert.equal(projects[active]?.id, "project:beta");
  assert.equal(projects[moveActive(active, projects.length, "select")]?.id, "project:beta");
});

test("Projects to All keeps the selected project instead of selecting a command", () => {
  const projects = results("projects", "a");
  const all = results("all", "a");
  const active = tabSelectionIndex({ from: "projects", to: "all", selected: projects[1], results: all });
  assert.equal(all[active]?.id, "project:beta");
});

test("a project absent from the destination falls back to its first result", () => {
  assert.equal(tabSelectionIndex({ from: "all", to: "projects", selected: results("projects")[1], results: results("projects", "Alpha") }), 0);
});

test("non-project tab transitions keep their existing initial selection", () => {
  const selected = results("projects")[1];
  assert.equal(tabSelectionIndex({ from: "all", to: "workspaces", selected, results: [] }), -1);
  assert.equal(tabSelectionIndex({ from: "projects", to: "actions", selected, results: results("actions") }), 0);
  assert.equal(tabSelectionIndex({ from: "actions", to: "projects", selected: results("actions")[0], results: results("projects") }), 0);
});
