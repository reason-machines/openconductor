import assert from "node:assert/strict";
import { test } from "node:test";
import { buildResults, type PaletteData } from "./model.ts";
import { commandScore, filterScore } from "./score.ts";

const section = { id: "create-section", title: "Create section", group: "actions", keywords: ["create", "new", "section", "sidebar"] } as const;
const approvals = {
  id: "row-account-Codex tool approvals",
  title: "Codex tool approvals",
  section: "Account",
  keywords: ["settings", "codex tool approvals", "codex", "tool", "approvals", "account"],
  row: true,
} as const;

test("scattered letters across command aliases stay below the palette threshold", () => {
  assert.equal(filterScore(section.title, "cairo", section.keywords), 0);
});

test("scattered letters across a setting and its aliases stay below the palette threshold", () => {
  assert.equal(filterScore(approvals.title, "cairo", [approvals.section, ...approvals.keywords]), 0);
});

test("a workspace-name query does not put scattered command and settings matches before the workspace", () => {
  const data: PaletteData = {
    actions: [section],
    settings: [approvals],
    projects: [],
    workspaces: [{ id: "cairo", name: "Cairo", branch: "cairo", repoName: "test-repo", lastActiveAt: 1 }],
    recentWorkspaceIds: [],
    activeWorkspaceId: null,
  };
  assert.deepEqual(buildResults("all", "cairo", data).flatMap((group) => group.items.map((item) => item.id)), ["workspace:cairo"]);
});

test("contiguous aliases and word starts remain searchable", () => {
  assert.ok(filterScore(section.title, "new section", section.keywords) > 0.2);
  assert.ok(filterScore(approvals.title, "tool approvals", [approvals.section, ...approvals.keywords]) > 0.2);
  assert.ok(filterScore("Toggle theme", "tt") > 0.2);
  assert.equal(commandScore("Open", "Open"), 1);
  assert.equal(filterScore("Open", "zzqx"), 0);
});
