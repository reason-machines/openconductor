import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLEARED_FILTERS,
  DEFAULT_FILTERS,
  dateBucket,
  emptyAction,
  groupByDate,
  homeRows,
  matchWorkspace,
  parseFilters,
  projectFilterLabel,
  shortRelativeTime,
  showProjectFilter,
  toggleProject,
} from "./allWorkspaces.ts";
import type { Repo, Workspace } from "../state/types";
import type { DbRepoRow, DbWorkspaceRow } from "../state/persisted.ts";
import { reposFromDb } from "../state/persisted.ts";
import { archivedFromRows } from "../workspace/archivedList.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Local noon, so "today" and "yesterday" don't depend on the clock.
const NOW = new Date(2026, 10, 5, 12, 0, 0).getTime();

function ws(id: string, over: Partial<Workspace> = {}): Workspace {
  return { id, name: id, branch: id, status: "idle", diff: { added: 0, removed: 0 }, createdAt: NOW - HOUR, ...over };
}

function repo(id: string, workspaces: Workspace[]): Repo {
  return { id, name: id, path: `/code/${id}`, defaultBranch: "main", workspaces };
}

test("date buckets count whole days back from local midnight", () => {
  const midnight = new Date(2026, 10, 5).getTime();
  assert.equal(dateBucket(midnight, NOW), "today");
  assert.equal(dateBucket(midnight - 1, NOW), "yesterday");
  assert.equal(dateBucket(midnight - DAY + 1, NOW), "yesterday");
  assert.equal(dateBucket(midnight - DAY, NOW), "2daysAgo");
  assert.equal(dateBucket(midnight - DAY - 1, NOW), "2daysAgo");
  assert.equal(dateBucket(midnight - 6 * DAY + 1, NOW), "6daysAgo");
  assert.equal(dateBucket(midnight - 6 * DAY - 1, NOW), "1weekAgo");
  assert.equal(dateBucket(midnight - 14 * DAY - 1, NOW), "2weeksAgo");
  assert.equal(dateBucket(midnight - 21 * DAY - 1, NOW), "3weeksAgo");
  assert.equal(dateBucket(midnight - 30 * DAY - 1, NOW), "1monthAgo");
  assert.equal(dateBucket(midnight - 60 * DAY - 1, NOW), "2monthsAgo");
  assert.equal(dateBucket(midnight - 90 * DAY - 1, NOW), "3monthsAgo");
  assert.equal(dateBucket(midnight - 120 * DAY - 1, NOW), "older");
});

test("row time is date-fns formatDistance, shortened like Conductor", () => {
  assert.equal(shortRelativeTime(NOW - 20_000, NOW), "now");
  assert.equal(shortRelativeTime(NOW + 5 * MIN, NOW), "now");
  assert.equal(shortRelativeTime(NOW - MIN, NOW), "1m");
  assert.equal(shortRelativeTime(NOW - 8 * MIN, NOW), "8m");
  assert.equal(shortRelativeTime(NOW - 44 * MIN, NOW), "44m");
  assert.equal(shortRelativeTime(NOW - 45 * MIN, NOW), "1h");
  assert.equal(shortRelativeTime(NOW - 2 * HOUR, NOW), "2h");
  assert.equal(shortRelativeTime(NOW - 23 * HOUR, NOW), "23h");
  assert.equal(shortRelativeTime(NOW - 30 * HOUR, NOW), "1d");
  assert.equal(shortRelativeTime(NOW - 3 * DAY, NOW), "3d");
  assert.equal(shortRelativeTime(NOW - 40 * DAY, NOW), "1mo");
  assert.equal(shortRelativeTime(NOW - 400 * DAY, NOW), "1y");
});

test("search needs every word somewhere and highlights each field", () => {
  const fields = { name: "Add search to settings", branch: "ada/settings-search", directory: "tallinn", repo: "tide-web" };
  assert.equal(matchWorkspace("search tide", fields)?.name?.text, "Add search to settings");
  assert.deepEqual(matchWorkspace("tide", fields)?.repo?.indices, [0, 1, 2, 3]);
  assert.equal(matchWorkspace("search api", fields), undefined);
  assert.ok(matchWorkspace("TALLINN", fields)?.directory);
});

test("search matches workspace numbers as 12, w12 and w-12", () => {
  const fields = { name: "x", branch: "x", directory: "x", repo: "x", number: 12 };
  assert.deepEqual(matchWorkspace("12", fields)?.number, { text: "W-12", indices: [2, 3] });
  assert.deepEqual(matchWorkspace("w-1", fields)?.number, { text: "W-12", indices: [0, 1, 2] });
  assert.deepEqual(matchWorkspace("w12", fields)?.number, { text: "W-12", indices: [0, 2, 3] });
  assert.equal(matchWorkspace("13", fields), undefined);
});

test("Home search finds a known pull request number and combines it with text and filters", () => {
  const pullRequest = {
    number: 43210,
    isMerged: false,
    isDraft: false,
    inMergeQueue: false,
    mergeState: "CLEAN",
    checks: null,
    failingChecks: 0,
    viewerCanMerge: true,
  };
  const repos = [
    repo("tide-web", [
      ws("osaka", { prTitle: "Fix login", pr: pullRequest }),
      ws("lisbon", { prTitle: "Fix login", pr: { ...pullRequest, number: 43220 } }),
      ws("quito"),
      ws("bergen", { pr: null }),
    ]),
  ];
  for (const query of ["#43210", "43210", "login #43210", "tide-web #43210"]) {
    assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, query).map((r) => r.workspace.id), ["osaka"], query);
  }
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "#43290"), []);
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "api #43210"), []);
  assert.deepEqual(homeRows(repos, { projects: ["tide-api"], archiveFilter: "active" }, "#43210"), []);
});

test("rows hide archived by default, filter by project, and sort newest first", () => {
  const repos = [
    repo("tide-web", [ws("osaka", { updatedAt: NOW - 8 * MIN }), ws("old", { status: "archived" })]),
    repo("tide-api", [ws("tallinn", { updatedAt: NOW - 11 * MIN })]),
  ];
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "").map((r) => r.workspace.id), ["osaka", "tallinn"]);
  assert.deepEqual(homeRows(repos, { projects: [], archiveFilter: "archived" }, "").map((r) => r.workspace.id), ["old"]);
  assert.deepEqual(homeRows(repos, { projects: [], archiveFilter: "all" }, "").length, 3);
  assert.deepEqual(homeRows(repos, { projects: ["tide-api"], archiveFilter: "active" }, "").map((r) => r.workspace.id), ["tallinn"]);
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "api").map((r) => r.workspace.id), ["tallinn"]);
});

test("row titles follow the sidebar display-name rule", () => {
  const repos = [repo("r", [ws("lisbon", { branch: "ada/dark-mode" }), ws("bergen", { prTitle: "Fix login" })])];
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "").map((r) => r.title).sort(), ["Ada/dark mode", "Fix login"]);
});

test("groups come in Conductor's order and skip empty days", () => {
  const repos = [repo("r", [ws("a", { createdAt: NOW - 3 * DAY }), ws("b", { createdAt: NOW - HOUR }), ws("c", { createdAt: NOW - 2 * HOUR })])];
  const groups = groupByDate(homeRows(repos, DEFAULT_FILTERS, ""), NOW);
  assert.deepEqual(groups.map((g) => [g.label, g.rows.length]), [["Today", 2], ["3 days ago", 1]]);
});

test("project filter shows only with two or more projects that have workspaces", () => {
  const repos = [repo("a", [ws("x")]), repo("b", []), repo("c", [ws("y")])];
  assert.equal(showProjectFilter(repos), true);
  assert.equal(showProjectFilter(repos.slice(0, 2)), false);
  assert.equal(projectFilterLabel(repos, []), "In all projects");
  assert.equal(projectFilterLabel(repos, ["c"]), "In c");
  assert.equal(projectFilterLabel(repos, ["a", "c"]), "In 2 projects");
  assert.deepEqual(toggleProject(["a"], "c"), ["a", "c"]);
  assert.deepEqual(toggleProject(["a", "c"], "a"), ["c"]);
});

test("empty list offers Create with no workspaces, Clear filters when filtered", () => {
  assert.equal(emptyAction([], DEFAULT_FILTERS), "create");
  assert.equal(emptyAction([repo("a", [ws("x", { status: "archived" })])], DEFAULT_FILTERS), "create");
  assert.equal(emptyAction([repo("a", [ws("x")])], DEFAULT_FILTERS), "clear");
  assert.equal(emptyAction([repo("a", [ws("x")])], CLEARED_FILTERS), null);
});

test("saved filters drop unknown projects and bad values", () => {
  const ids = new Set(["a"]);
  assert.deepEqual(parseFilters(JSON.stringify({ projects: ["a", "gone"], archiveFilter: "all" }), ids), { projects: ["a"], archiveFilter: "all" });
  assert.deepEqual(parseFilters(JSON.stringify({ archiveFilter: "nope" }), ids), DEFAULT_FILTERS);
  assert.deepEqual(parseFilters("{bad", ids), DEFAULT_FILTERS);
  assert.deepEqual(parseFilters(null, ids), DEFAULT_FILTERS);
});

// Conductor's `UJo` filters one list holding active and archived workspaces;
// ours drops archived rows from the sidebar state (reposFromDb), so Home takes
// conductor.db's archived rows (listArchivedWorkspaces) as a second input.
test("archived workspaces from conductor.db show under Only archived and Showing all", () => {
  const row = (id: string, state: string, branch: string): DbWorkspaceRow => ({
    id,
    repositoryId: "tide-web",
    directoryName: id,
    workspaceName: null,
    branch,
    placeholderBranchName: null,
    state,
    derivedStatus: null,
    manualStatus: null,
    workspacePath: `/code/tide-web/.conductor/${id}`,
    pinnedAt: null,
    unread: false,
    prTitle: null,
    prDescription: null,
    number: null,
    createdAt: new Date(NOW - 2 * DAY).toISOString(),
    updatedAt: new Date(NOW - DAY).toISOString(),
  });
  const db = [row("osaka", "ready", "ada/osaka"), row("lisbon", "archived", "ada/lisbon")];
  const repos = reposFromDb([{ id: "tide-web", name: "tide-web", rootPath: "/code/tide-web", defaultBranch: "main", displayOrder: 0, hidden: false, icon: null, remoteUrl: null } as DbRepoRow], db, []);
  assert.deepEqual(repos[0]!.workspaces.map((w) => w.id), ["osaka"], "the sidebar state has no archived rows");
  const archived = archivedFromRows(db);

  const only = homeRows(repos, { projects: [], archiveFilter: "archived" }, "", archived);
  assert.deepEqual(only.map((r) => r.workspace.id), ["lisbon"]);
  assert.equal(only[0]!.archived, true);
  assert.equal(only[0]!.workspace.branch, "ada/lisbon", "an archived row shows the branch stored at archive time");

  const all = homeRows(repos, { projects: [], archiveFilter: "all" }, "", archived);
  assert.deepEqual(all.map((r) => r.workspace.id).sort(), ["lisbon", "osaka"]);
  assert.deepEqual(homeRows(repos, DEFAULT_FILTERS, "", archived).map((r) => r.workspace.id), ["osaka"]);
  assert.deepEqual(homeRows(repos, { projects: [], archiveFilter: "archived" }, "lisbon", archived).map((r) => r.workspace.id), ["lisbon"]);
});

test("archived rows of closed repositories, or already in the state, are not listed twice", () => {
  const live = ws("kept", { status: "archived" });
  const repos = [repo("a", [live])];
  const entry = (id: string, repoId: string) => ({ id, repoId, name: id, branch: id, createdAt: NOW, workspace: ws(id, { status: "archived" }) });
  const rows = homeRows(repos, { projects: [], archiveFilter: "archived" }, "", [entry("kept", "a"), entry("gone", "closed-repo")]);
  assert.deepEqual(rows.map((r) => r.workspace.id), ["kept"]);
});
