import { test } from "node:test";
import assert from "node:assert/strict";
import referenceRows from "../../evidence/settings/palette-result-cap/rows.json" with { type: "json" };
import { AGENTS_TABS, AGENTS_TAB_LABEL } from "../settings/agents/kitModel.ts";
import { settingsGroups } from "../settings/pages.ts";
import { buildSearchIndex } from "../settings/searchIndex.ts";
import { paletteSettings } from "./fromAppState.ts";
import { buildResults, type PaletteData } from "./search/model.ts";

const sharedPages = settingsGroups(false).flatMap((group) => group.pages);
const sharedTabs = AGENTS_TABS.map((id) => ({ id, label: AGENTS_TAB_LABEL[id] }));

// cloudUI=false: the default palette (no cloud-only rows exposed)
const settings = paletteSettings(buildSearchIndex({
  pages: sharedPages,
  agentTabs: sharedTabs,
  hasRepos: false,
}));
const data: PaletteData = {
  workspaces: [], projects: [], actions: [], settings,
  recentWorkspaceIds: [], activeWorkspaceId: null,
};

// cloudUI=true: used only to verify reference-row coverage, since the 62
// evidence rows include cloud-only entries that are intentionally hidden when
// experimental_cloud_ui is OFF (M6c).
const settingsCloud = paletteSettings(buildSearchIndex({
  pages: sharedPages,
  agentTabs: sharedTabs,
  hasRepos: false,
  cloudUI: true,
}));
const dataCloud: PaletteData = {
  workspaces: [], projects: [], actions: [], settings: settingsCloud,
  recentWorkspaceIds: [], activeWorkspaceId: null,
};

for (const tab of ["settings", "all"] as const) {
  test(`${tab} search reaches every real Settings match, including the 62 shared reference rows`, () => {
    assert.equal(referenceRows.length, 62);
    // Reference rows include cloud-only entries; verify against the cloudUI=true index.
    const available = new Set(settingsCloud.map((item) => item.id));
    for (const row of referenceRows) assert.ok(available.has(row.current_id), row.current_id);
    const results = buildResults(tab, "settings", dataCloud).find((group) => group.id === "settings")?.items ?? [];
    const found = new Set(results.map((item) => item.id));
    assert.deepEqual(found, new Set(settingsCloud.map((item) => `setting:${item.id}`)));
    for (const row of referenceRows) assert.ok(found.has(`setting:${row.current_id}`), row.current_id);
  });
}

test("empty Settings search lists pages only and a nonmatching query lists nothing", () => {
  const results = buildResults("settings", "", data).flatMap((group) => group.items);
  assert.deepEqual(results.map((item) => item.id), settings.filter((item) => !item.row).map((item) => `setting:${item.id}`));
  assert.deepEqual(buildResults("settings", "zzzzzzzzzzzzzzzzzzzzzz", data), []);
  assert.ok(!buildResults("actions", "settings", data).some((group) => group.id === "settings"));
});
