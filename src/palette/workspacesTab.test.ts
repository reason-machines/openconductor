import { test } from "node:test";
import assert from "node:assert/strict";
import { compactProjectLabel, showClearFilters, workspacesTabRows } from "./workspacesTab.ts";
import { moveActive } from "./state.ts";
import { CLEARED_FILTERS, DEFAULT_FILTERS } from "../home/allWorkspaces.ts";
import type { Repo, Workspace } from "../state/types";
import type { ArchivedWorkspace } from "../workspace/archivedList.ts";

const HOUR = 3_600_000;
const NOW = Date.now();
const ws = (id: string, over: Partial<Workspace> = {}): Workspace => ({ id, name: id, branch: `ada/${id}`, status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - 10 * HOUR, ...over });
const repo = (id: string, workspaces: Workspace[]): Repo => ({ id, name: id, path: `/code/${id}`, defaultBranch: "main", workspaces });
const gone = (id: string, repoId: string, createdAt: number): ArchivedWorkspace => {
  const workspace = ws(id, { createdAt, status: "archived" });
  return { id, repoId, name: id, branch: workspace.branch, createdAt, workspace };
};

const repos = [
  repo("tide-web", [ws("osaka", { updatedAt: NOW - HOUR }), ws("lisbon", { updatedAt: NOW - 3 * HOUR })]),
  repo("tide-api", [ws("tallinn", { updatedAt: NOW - 2 * HOUR })]),
];
const archived = [gone("accra", "tide-api", NOW - 5 * HOUR)];
const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

test("rows are newest first; Hiding archived leaves archived workspaces out", () => {
  const { active, archived: arch } = workspacesTabRows(repos, DEFAULT_FILTERS, "", archived);
  assert.deepEqual(titles(active), ["Ada/osaka", "Ada/tallinn", "Ada/lisbon"]);
  assert.deepEqual(arch, []);
});

test("Showing all lists archived workspaces in their own group; Only archived lists only them", () => {
  const all = workspacesTabRows(repos, { projects: [], archiveFilter: "all" }, "", archived);
  assert.equal(all.active.length, 3);
  assert.deepEqual(titles(all.archived), ["Ada/accra"]);
  const only = workspacesTabRows(repos, { projects: [], archiveFilter: "archived" }, "", archived);
  assert.deepEqual(only.active, []);
  assert.deepEqual(titles(only.archived), ["Ada/accra"]);
});

test("the project filter and the query narrow the rows", () => {
  assert.deepEqual(titles(workspacesTabRows(repos, { projects: ["tide-api"], archiveFilter: "active" }, "", archived).active), ["Ada/tallinn"]);
  assert.deepEqual(titles(workspacesTabRows(repos, DEFAULT_FILTERS, "lis", archived).active), ["Ada/lisbon"]);
  assert.deepEqual(workspacesTabRows(repos, DEFAULT_FILTERS, "zzzz", archived), { active: [], archived: [] });
});

test("rows are capped at 50 (Conductor's GHe)", () => {
  const many = [repo("r", Array.from({ length: 60 }, (_, i) => ws(`w${i}`)))];
  assert.equal(workspacesTabRows(many, DEFAULT_FILTERS, "").active.length, 50);
});

test("Clear filters shows under the empty list whenever a filter is set, Hiding archived included", () => {
  assert.equal(showClearFilters(DEFAULT_FILTERS), true);
  assert.equal(showClearFilters({ projects: ["tide-web"], archiveFilter: "all" }), true);
  assert.equal(showClearFilters(CLEARED_FILTERS), false);
});

test("the compact project filter reads All projects, the project's name, or a count", () => {
  assert.equal(compactProjectLabel(repos, []), "All projects");
  assert.equal(compactProjectLabel(repos, ["tide-api"]), "tide-api");
  assert.equal(compactProjectLabel(repos, ["tide-web", "tide-api"]), "2 projects");
});

test("with no row highlighted, the first move picks the first or the last row", () => {
  assert.equal(moveActive(-1, 4, "next-item"), 0);
  assert.equal(moveActive(-1, 4, "prev-item"), 3);
  assert.equal(moveActive(-1, 4, "last-item"), 3);
  assert.equal(moveActive(-1, 4, "first-item"), 0);
});
