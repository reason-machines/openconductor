import { test } from "node:test";
import assert from "node:assert/strict";
import { shortcutOrder } from "./fromAppState.ts";
import { sidebarEntries } from "../state/sidebarOrder.ts";
import { hintNumbers } from "../state/shortcutHint.ts";
import type { AppState, Workspace } from "../state/types.ts";

const workspace = (id: string, createdAt: number, extra: Partial<Workspace> = {}): Workspace => ({
  id, name: id, branch: id, createdAt, updatedAt: createdAt,
  status: "idle", diff: { added: 0, removed: 0 }, ...extra,
});

const fixture: AppState = {
  selection: { kind: "home" },
  repos: [
    { id: "alpha", name: "alpha", path: "/invented/alpha", defaultBranch: "main", collapsed: false, workspaces: [
      workspace("pinned", 1, { pinnedAt: 1 }),
      workspace("section-alpha", 30),
      workspace("visible-alpha", 20, { manualStatus: "in-progress" }),
    ] },
    { id: "beta", name: "beta", path: "/invented/beta", defaultBranch: "main", collapsed: false, workspaces: [
      workspace("section-beta", 40),
      workspace("visible-beta", 10, { manualStatus: "done" }),
    ] },
  ],
  sections: [{ id: "focus", name: "Focus", workspaceIds: ["section-alpha", "section-beta"] }],
  sidebarStatusCollapsed: { backlog: false, "in-progress": false, "in-review": true, done: false, canceled: true },
};

for (const sidebarGroupBy of ["repo", "status"] as const) {
  for (const sidebarRepoFilter of [null, "alpha", "beta"]) {
    for (const collapsed of [false, true]) {
      test(`${sidebarGroupBy}; filter=${sidebarRepoFilter ?? "all"}; Focus=${collapsed ? "collapsed" : "expanded"}: numbers target their labelled row`, () => {
        const state: AppState = { ...fixture, sidebarGroupBy, sidebarRepoFilter };
        const collapsedSections = new Set(collapsed ? ["focus"] : []);
        const rows = sidebarEntries(state, { visibleOnly: true, collapsedSections });
        const numbers = hintNumbers(rows.map(({ workspace }) => workspace.id));
        const activation = shortcutOrder(state, collapsedSections);
        assert.deepEqual(
          [...numbers].map(([id, number]) => ({ label: id, target: activation[number - 1]?.workspace.id })),
          [...numbers].map(([id]) => ({ label: id, target: id })),
        );
      });
    }
  }
}
