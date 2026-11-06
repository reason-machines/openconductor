import { test } from "node:test";
import assert from "node:assert/strict";
import { commandScore, filterScore, tokensMatch } from "./search/score.ts";
import { buildResults, cycleTab, emptyText, groupOrder, placeholderFor, RESULT_CAP, type PaletteData } from "./search/model.ts";

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
    { id: "settings", title: "Settings", group: "navigation" },
    { id: "open-vscode", title: "VS Code", group: "open-in" },
  ],
  settings: [
    { id: "appearance", title: "Appearance", keywords: ["settings", "appearance", "theme"] },
    { id: "appearance.theme", title: "Theme", section: "Appearance", row: true },
  ],
  recentWorkspaceIds: ["w2", "w4", "gone", "w1"],
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

test("All tab with empty query: recents (archived included, unknown ids dropped) then action groups in fixed order", () => {
  assert.deepEqual(ids("all", ""), [
    "Recent workspaces: w2,w4,w1",
    "Workspace actions: quick-open,archive-workspace",
    "Actions: new-workspace,toggle-theme",
    "Navigation: go-home,settings",
    "Settings: appearance",
    "Open in: open-vscode",
  ]);
});

test("workspace actions are hidden without an active workspace", () => {
  const groups = ids("all", "", { ...data, activeWorkspaceId: null });
  assert.ok(!groups.some((g) => g.startsWith("Workspace actions")));
});

test("All tab with a query: command groups ranked by their words, then Projects, then Workspaces (Conductor's `J1`)", () => {
  // "theme" is in the Actions and Settings words; Actions comes first in the fixed order.
  assert.deepEqual(ids("all", "theme"), ["Actions: toggle-theme", "Settings: appearance.theme,appearance", "Workspaces: "]);
  assert.deepEqual(ids("all", "oslo"), ["Workspaces: w2"]);
  assert.deepEqual(ids("all", "find"), ["Workspace actions: quick-open", "Workspaces: "]);
  assert.deepEqual(ids("all", "mono"), ["Projects: p2"], "Workspaces is dropped while a project matches and no workspace does");
});

test("a query nothing matches keeps the All tab's Workspaces group with \"No results found\"", () => {
  const groups = buildResults("all", "zzqx", data);
  assert.deepEqual(groups.map((g) => [g.heading, g.items.length, g.emptyText]), [["Workspaces", 0, "No results found"]]);
});

test("group order follows the query's words: settings words put Settings first", () => {
  assert.deepEqual(groupOrder(""), ["workspace-actions", "actions", "navigation", "settings", "open-in"]);
  assert.deepEqual(groupOrder("git env").slice(0, 1), ["settings"]);
  assert.deepEqual(groupOrder("vscode", ["vscode"]).slice(0, 1), ["open-in"]);
});

test("Workspaces tab lists non-archived workspaces newest first and caps results", () => {
  assert.deepEqual(ids("workspaces", ""), ["Workspaces: w2,w3,w1"]);
  assert.deepEqual(ids("workspaces", "sven ky"), ["Workspaces: w3"]);
  const many = { ...data, workspaces: Array.from({ length: 80 }, (_, i) => ws(`m${i}`, `ws${i}`, i)) };
  assert.equal(buildResults("workspaces", "", many)[0].items.length, RESULT_CAP);
});

test("Projects, Actions and Settings tabs", () => {
  assert.deepEqual(ids("projects", "mono"), ["undefined: p2"], "the Projects tab has one group with no heading");
  assert.deepEqual(ids("actions", "new"), ["Actions: new-workspace"]);
  assert.deepEqual(ids("actions", ""), ["Workspace actions: quick-open,archive-workspace", "Actions: new-workspace,toggle-theme", "Open in: open-vscode"]);
  assert.deepEqual(ids("settings", "appear"), ["Settings: appearance,appearance.theme"]);
  assert.deepEqual(ids("settings", ""), ["Settings: appearance"]);
  assert.deepEqual(ids("projects", "nothing"), []);
});

test("Workspaces tab archive filter: hiding archived by default, showing all, only archived; other tabs never list them", () => {
  const ws = (f?: Parameters<typeof buildResults>[3]) => buildResults("workspaces", "", data, f)[0].items.map((i) => i.id.split(":")[1]);
  assert.deepEqual(ws(), ["w2", "w3", "w1"]);
  assert.deepEqual(ws("active"), ["w2", "w3", "w1"]);
  assert.deepEqual(ws("all"), ["w2", "w3", "w1", "w4"]);
  assert.deepEqual(ws("archived"), ["w4"]);
  assert.ok(!ids("all", "lima").some((g) => g.includes("w4")));
});
