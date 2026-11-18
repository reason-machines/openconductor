// Candidate-vs-pinned-main preservation checks, not new Conductor parity claims.
// Run verify-implementation.py first to populate the exact baseline snapshot.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sidebarEntries as candidate } from "../../../src/state/sidebarOrder.ts";
import { sidebarEntries as baseline } from "../../../.oc-tmp/sidebar-project-filter-numbering/fresh-main/src/state/sidebarOrder.ts";
import type { AppState, Workspace } from "../../../src/state/types.ts";

const ws = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, status: "idle", createdAt, updatedAt: 100 - createdAt,
  diff: { added: 0, removed: 0 }, ...extra,
});
const state: AppState = {
  selection: { kind: "home" }, sidebarGroupBy: "repo", sidebarRepoFilter: "beta",
  sections: [{ id: "focus", name: "Focus", workspaceIds: ["alpha-section", "beta-section"] }],
  repos: ["alpha", "beta"].map((id, i) => ({
    id, name: id, path: `/fixture/${id}`, defaultBranch: "main", collapsed: false,
    workspaces: [ws(`${id}-pin`, 1 + i, { pinnedAt: 2 - i }), ws(`${id}-section`, 10 + i),
      ws(`${id}-old`, 20 + i), ws(`${id}-new`, 30 + i), ws(`${id}-archive`, 40 + i, { status: "archived" })],
  })),
};
const ids = (entries: ReturnType<typeof candidate>) => entries.map(({ workspace }) => workspace.id);

for (const filter of [undefined, null, ""] as const) {
  for (const visibleOnly of [false, true]) {
    test(`no-filter legacy order unchanged: filter=${String(filter)}, visibleOnly=${visibleOnly}`, () => {
      const value = { ...state, sidebarRepoFilter: filter };
      assert.deepEqual(candidate(value, { visibleOnly }), baseline(value, { visibleOnly }));
    });
  }
}
for (const filter of [undefined, null, "alpha", "beta", "missing"]) {
  test(`status-group branch unchanged: filter=${String(filter)}`, () => {
    const value: AppState = { ...state, sidebarGroupBy: "status", sidebarRepoFilter: filter,
      sidebarStatusCollapsed: { backlog: false, "in-progress": false, "in-review": true, done: true, canceled: false } };
    for (const visibleOnly of [false, true]) {
      assert.deepEqual(candidate(value, { visibleOnly }), baseline(value, { visibleOnly }));
    }
  });
}
for (const pinnedCollapsed of [false, true]) {
  for (const collapseSections of [false, true]) {
    test(`filter preserves cross-project prefix: pins=${pinnedCollapsed}, sections=${collapseSections}`, () => {
      const options = { visibleOnly: true, pinnedCollapsed, collapsedSections: new Set(collapseSections ? ["focus"] : []) };
      const original = baseline(state, options);
      assert.deepEqual(candidate(state, options), original.filter(({ repoId, workspace }) =>
        repoId === "beta" || workspace.id.endsWith("-pin") || workspace.id.endsWith("-section")));
    });
  }
}
for (const collapsed of [undefined, false, true]) {
  for (const sidebarSort of ["created", "updated"] as const) {
    test(`filtered repo collapse/sort is unchanged: collapsed=${String(collapsed)}, sort=${sidebarSort}`, () => {
      const value: AppState = { ...state, sidebarSort, repos: state.repos.map((repo) => ({ ...repo, collapsed })) };
      const selectedOnly: AppState = { ...value, repos: value.repos.filter(({ id }) => id === "beta"), sections: [] };
      const withoutPrefixes: AppState = { ...selectedOnly, repos: selectedOnly.repos.map((repo) => ({
        ...repo, workspaces: repo.workspaces.filter(({ id, pinnedAt }) => pinnedAt === undefined && !id.endsWith("-section")),
      })) };
      const actual = candidate(value, { visibleOnly: true }).filter(({ workspace }) => !workspace.id.endsWith("-pin") && !workspace.id.endsWith("-section"));
      assert.deepEqual(actual, baseline(withoutPrefixes, { visibleOnly: true }));
    });
  }
}
test("hidden/archive policy is unchanged apart from removing nonmatching repo groups", () => {
  const value = { ...state, sections: [], repos: state.repos.map((repo) => ({ ...repo, hidden: true })) };
  const original = baseline(value);
  assert.deepEqual(candidate(value), original.filter(({ repoId, workspace }) => repoId === "beta" || workspace.pinnedAt !== undefined));
});
test("unknown project filter leaves prefix rows only and does not mutate loaded records", () => {
  const value = { ...state, sidebarRepoFilter: "missing" };
  const before = structuredClone(value);
  assert.deepEqual(ids(candidate(value)), ["beta-pin", "alpha-pin", "alpha-section", "beta-section"]);
  assert.deepEqual(value, before);
});
