import { test } from "node:test";
import assert from "node:assert/strict";
import referenceRows from "../../evidence/settings/palette-result-cap/rows.json" with { type: "json" };
import { AGENTS_TABS, AGENTS_TAB_LABEL } from "../settings/agents/kitModel.ts";
import { settingsGroups } from "../settings/pages.ts";
import { buildSearchIndex } from "../settings/searchIndex.ts";
import { paletteSettings } from "./fromAppState.ts";
import { buildResults, type PaletteData } from "./search/model.ts";

const settings = paletteSettings(buildSearchIndex({
  pages: settingsGroups(false).flatMap((group) => group.pages),
  agentTabs: AGENTS_TABS.map((id) => ({ id, label: AGENTS_TAB_LABEL[id] })),
  hasRepos: false,
}));
const data: PaletteData = {
  workspaces: [], projects: [], actions: [], settings,
  recentWorkspaceIds: [], activeWorkspaceId: null,
};

for (const tab of ["settings", "all"] as const) {
  test(`${tab} search reaches every real Settings match, including the 62 shared reference rows`, () => {
    assert.equal(referenceRows.length, 62);
    const available = new Set(settings.map((item) => item.id));
    for (const row of referenceRows) assert.ok(available.has(row.current_id), row.current_id);
    const results = buildResults(tab, "settings", data).find((group) => group.id === "settings")?.items ?? [];
    const found = new Set(results.map((item) => item.id));
    assert.deepEqual(found, new Set(settings.map((item) => `setting:${item.id}`)));
    for (const row of referenceRows) assert.ok(found.has(`setting:${row.current_id}`), row.current_id);
  });
}

test("empty Settings search lists pages only and a nonmatching query lists nothing", () => {
  const results = buildResults("settings", "", data).flatMap((group) => group.items);
  assert.deepEqual(results.map((item) => item.id), settings.filter((item) => !item.row).map((item) => `setting:${item.id}`));
  assert.deepEqual(buildResults("settings", "zzzzzzzzzzzzzzzzzzzzzz", data), []);
  assert.ok(!buildResults("actions", "settings", data).some((group) => group.id === "settings"));
});
