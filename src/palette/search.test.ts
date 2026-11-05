import { test } from "node:test";
import assert from "node:assert/strict";
import { commandScore, filterScore, tokensMatch } from "./search/score.ts";
import { buildResults, cycleTab, emptyText, placeholderFor, RESULT_CAP, type PaletteData } from "./search/model.ts";

const ws = (id: string, name: string, lastActiveAt: number, extra = {}) => ({
  id,
  name,
  branch: `sven/${name}`,
  repoName: "openconductor",
  lastActiveAt,
  ...extra,
});

const data: PaletteData = {
  workspaces: [ws("w1", "lisbon", 10), ws("w2", "oslo", 30), ws("w3", "kyoto", 20), ws("w4", "lima", 5, { archived: true })],
  projects: [
    { id: "p1", name: "openconductor" },
    { id: "p2", name: "reason monorepo" },
  ],
  actions: [
    { id: "quick-open", title: "File picker", group: "workspace-actions", keywords: ["quick", "open", "file", "find"] },
    { id: "archive-workspace", title: "Archive workspace", group: "workspace-actions" },
    { id: "new-workspace", title: "New workspace", group: "actions" },
    { id: "toggle-theme", title: "Toggle theme", group: "actions", keywords: ["dark", "light"] },
    { id: "go-home", title: "Go to Home", group: "navigation" },
    { id: "settings", title: "Open settings", group: "settings" },
    { id: "open-vscode", title: "VS Code", group: "open-in" },
  ],
  settings: [{ id: "appearance.theme", title: "Theme", section: "Appearance" }],
  recentWorkspaceIds: ["w2", "w4", "w1"],
  activeWorkspaceId: "w2",
};

const ids = (tab: Parameters<typeof buildResults>[0], q: string, d = data) =>
  buildResults(tab, q, d).map((g) => `${g.heading}: ${g.items.map((i) => i.id.split(":")[1]).join(",")}`);

test("scores: exact > prefix > word-start initials > scattered; misses are 0", () => {
  const exact = commandScore("toggle theme", "toggle theme");
  const prefix = commandScore("toggle theme", "tog");
  const initials = commandScore("toggle theme", "tt");
  const scattered = commandScore("toggle theme", "oe");
  assert.ok(exact > prefix && prefix > initials && initials > scattered, `${exact} ${prefix} ${initials} ${scattered}`);
  assert.equal(commandScore("toggle theme", "xyz"), 0);
  assert.ok(commandScore("File picker", "find", ["find"]) > 0.2);
  assert.equal(filterScore("archive workspace", "zz"), 0);
});

test("token matching needs every token in some field", () => {
  assert.ok(tokensMatch("reason mono", ["reason monorepo"]));
  assert.ok(!tokensMatch("reason web", ["reason monorepo"]));
});

test("tabs cycle with wrap and skip Projects when hidden", () => {
  assert.equal(cycleTab("all", 1, true), "workspaces");
  assert.equal(cycleTab("workspaces", 1, true), "projects");
  assert.equal(cycleTab("workspaces", 1, false), "actions");
  assert.equal(cycleTab("settings", 1, true), "all");
  assert.equal(cycleTab("all", -1, true), "settings");
  assert.equal(cycleTab("actions", -1, false), "workspaces");
  assert.equal(placeholderFor("all"), "Type a command or search...");
  assert.equal(emptyText("projects"), "No matching projects");
});

test("All tab with empty query: recents (skipping archived) then action groups in fixed order", () => {
  assert.deepEqual(ids("all", ""), [
    "Recent workspaces: w2,w1",
    "Workspace actions: quick-open,archive-workspace",
    "Actions: new-workspace,toggle-theme",
    "Navigation: go-home",
    "Settings: settings",
    "Open in: open-vscode",
  ]);
});

test("workspace actions are hidden without an active workspace", () => {
  const groups = ids("all", "", { ...data, activeWorkspaceId: null });
  assert.ok(!groups.some((g) => g.startsWith("Workspace actions")));
});

test("All tab with a query replaces recents with matches across kinds", () => {
  assert.deepEqual(ids("all", "theme"), ["Actions: toggle-theme", "Settings: appearance.theme"]);
  assert.deepEqual(ids("all", "oslo"), ["Workspaces: w2"]);
  assert.deepEqual(ids("all", "find"), ["Workspace actions: quick-open"]);
});

test("Workspaces tab lists non-archived workspaces newest first and caps results", () => {
  assert.deepEqual(ids("workspaces", ""), ["Workspaces: w2,w3,w1"]);
  assert.deepEqual(ids("workspaces", "sven ky"), ["Workspaces: w3"]);
  const many = { ...data, workspaces: Array.from({ length: 80 }, (_, i) => ws(`m${i}`, `ws${i}`, i)) };
  assert.equal(buildResults("workspaces", "", many)[0].items.length, RESULT_CAP);
});

test("Projects, Actions and Settings tabs", () => {
  assert.deepEqual(ids("projects", "mono"), ["Projects: p2"]);
  assert.deepEqual(ids("actions", "new"), ["Actions: new-workspace"]);
  assert.deepEqual(ids("settings", "appear"), ["Settings: appearance.theme"]);
  assert.deepEqual(ids("projects", "nothing"), []);
});
