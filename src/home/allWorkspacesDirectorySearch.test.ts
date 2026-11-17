import assert from "node:assert/strict";
import test from "node:test";
import { homeRows, type HomeFilters } from "./allWorkspaces.ts";
import { workspaceFromRow, type DbWorkspaceRow } from "../state/persisted.ts";
import type { Repo, Workspace } from "../state/types";
import { archivedFromRows } from "../workspace/archivedList.ts";

const stored: DbWorkspaceRow = {
  id: "renamed", repositoryId: "project", directoryName: "dirneedle", workspaceName: "Named",
  userSetWorkspaceName: true, branch: "topic/work", placeholderBranchName: null, state: "archived",
  derivedStatus: null, manualStatus: null, workspacePath: "/fixture/dirneedle", pinnedAt: null,
  unread: false, prTitle: null, prDescription: null, number: null, createdAt: "2026-11-12 12:00:00",
};
const project: Repo = { id: "project", name: "Project", path: "/fixture/project", defaultBranch: "main", workspaces: [] };
const archived: HomeFilters = { projects: [], archiveFilter: "archived" };

function search(query: string, filters = archived) {
  return homeRows([project], filters, query, archivedFromRows([stored]));
}

test("a renamed archived workspace is found by its preserved directory without changing its displayed title", () => {
  const before = JSON.stringify(stored);
  const rows = search("dirneedle");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workspace.id, "renamed");
  assert.equal(rows[0].title, "Named");
  assert.equal(rows[0].workspace.name, "Named");
  assert.equal(rows[0].workspace.directoryName, "dirneedle");
  assert.deepEqual(rows[0].matches?.directory, { text: "dirneedle", indices: [0, 1, 2, 3, 4, 5, 6, 7, 8] });
  assert.equal(rows[0].matches?.name, undefined);
  assert.equal(JSON.stringify(stored), before);
});

test("a renamed active workspace is found by its preserved directory", () => {
  const workspace = workspaceFromRow({ ...stored, state: "ready" });
  const rows = homeRows([{ ...project, workspaces: [workspace] }], { projects: [], archiveFilter: "active" }, "dirneedle");
  assert.deepEqual(rows.map((row) => [row.workspace.id, row.title]), [["renamed", "Named"]]);
  assert.equal(rows[0].matches?.directory?.text, "dirneedle");
});

test("directory matching remains case insensitive and trims the query", () => {
  assert.deepEqual(search("  DIRNEEDLE  ").map((row) => row.workspace.id), ["renamed"]);
});

test("directory and repository words can match together", () => {
  const rows = search("dirneedle project");
  assert.deepEqual(rows.map((row) => row.workspace.id), ["renamed"]);
  assert.equal(rows[0].matches?.directory?.text, "dirneedle");
  assert.equal(rows[0].matches?.repo?.text, "Project");
});

test("control: stored display-name and branch queries remain searchable", () => {
  for (const query of ["Named", "topic/work", "Named topic"]) {
    assert.deepEqual(search(query).map((row) => [row.workspace.id, row.title]), [["renamed", "Named"]]);
  }
});

test("control: an unmatched word still excludes the row", () => {
  assert.deepEqual(search("no-such-workspace"), []);
  assert.deepEqual(search("dirneedle no-such-workspace"), []);
});

test("control: matching a directory does not bypass archive or project filters", () => {
  assert.deepEqual(search("dirneedle", { projects: [], archiveFilter: "active" }), []);
  assert.deepEqual(search("dirneedle", { projects: ["other"], archiveFilter: "archived" }), []);
});

test("control: legacy workspaces without a separate directory retain name search", () => {
  const workspace: Workspace = { id: "legacy", name: "legacy-directory", branch: "main", status: "idle", createdAt: 0, diff: { added: 0, removed: 0 } };
  const rows = homeRows([{ ...project, workspaces: [workspace] }], { projects: [], archiveFilter: "active" }, "legacy-directory");
  assert.deepEqual(rows.map((row) => row.workspace.id), ["legacy"]);
});
