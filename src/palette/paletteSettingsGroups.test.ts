// GAP-PAL-02: PaletteHost must use the live bigTerminal pref (not hardcoded
// false) so the "Big terminal" settings page appears in the palette search when
// big terminal mode is enabled — matching SettingsView's behaviour
// (SettingsView.tsx:134,140).  Cloud is always excluded per architecture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex } from "../settings/searchIndex.ts";
import { settingsGroups } from "../settings/pages.ts";

// Minimal stand-in for AGENT_SEARCH_TABS from SettingsView.tsx (the .tsx cannot
// be imported directly by the node test runner without compilation).
const AGENT_TABS = [
  { id: "reason", label: "Reason" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];

function indexIds(bigTerminal: boolean): string[] {
  return buildSearchIndex({
    pages: settingsGroups(bigTerminal).flatMap((g) => g.pages),
    agentTabs: AGENT_TABS,
    hasRepos: false,
  }).map((item) => item.id);
}

test("palette settings index omits bigTerminal page when mode is off", () => {
  assert.ok(!indexIds(false).includes("terminal"), "terminal page must not appear when big terminal mode is off");
});

test("palette settings index includes bigTerminal page when mode is on", () => {
  assert.ok(indexIds(true).includes("terminal"), "terminal page must appear when big terminal mode is on");
});

test("palette settings index never includes cloud-only setup-cloud page", () => {
  // settingsGroups(_, cloud=false) is the architecture-mandated call; cloud UI excluded.
  assert.ok(!indexIds(false).includes("setup-cloud"), "cloud setup page must not appear (cloud UI excluded)");
  assert.ok(!indexIds(true).includes("setup-cloud"), "cloud setup page must not appear even with bigTerminal on");
});
