import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, keywordsFor, MAX_RESULTS, searchSettings } from "./searchIndex.ts";
import { settingsGroups } from "./pages.ts";

const pages = settingsGroups(false).flatMap((g) => g.pages);
const agentTabs = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
];
const index = buildSearchIndex({ pages, agentTabs, hasRepos: true });

test("Conductor's `qet` keywords: settings, the label, its words, then extras", () => {
  assert.deepEqual(keywordsFor("Default models", ["thinking"]), ["settings", "default models", "default", "models", "thinking"]);
});

test("pages come first in nav order, agent tabs right after Agents", () => {
  const ids = index.slice(0, pages.length + agentTabs.length).map((i) => i.id);
  const agents = ids.indexOf("providers");
  assert.deepEqual(ids.slice(agents, agents + 3), ["providers", "provider-claude", "provider-codex"]);
  assert.equal(ids[0], "general");
});

test("a blank query shows nothing; a query ranks pages and rows", () => {
  assert.deepEqual(searchSettings(index, "   "), []);
  const theme = searchSettings(index, "theme");
  assert.ok(theme.length > 0);
  assert.ok(theme.some((r) => r.item.id === "appearance"), "Appearance matches through its keywords");
  assert.ok(theme.some((r) => r.item.label === "Theme" && r.item.tabLabel === "Appearance"));
});

test("a row opens its page and names the row to scroll to", () => {
  const r = searchSettings(index, "completion sound")[0];
  assert.equal(r?.item.label, "Completion sound");
  assert.deepEqual(r?.item.target, { scope: "user", page: "general", row: "Completion sound" });
  assert.deepEqual(r?.match.field, "label");
});

test("repository rows and sections need a repository", () => {
  const files = searchSettings(index, "files to copy");
  assert.ok(files.some((r) => r.item.target.scope === "repo" && r.item.target.section === "misc"));
  const none = buildSearchIndex({ pages, agentTabs, hasRepos: false });
  assert.ok(!none.some((i) => i.target.scope === "repo"));
});

test("an agent tab result opens Agents on that tab", () => {
  const r = searchSettings(index, "anthropic").find((x) => x.item.id === "provider-claude");
  assert.deepEqual(r?.item.target, { scope: "user", page: "providers", providerTab: "claude" });
});

test("at most 30 results", () => {
  assert.ok(searchSettings(index, "e").length <= MAX_RESULTS);
});

test("rows only for pages that are listed (no Big terminal rows while the mode is off)", () => {
  assert.ok(!index.some((i) => i.target.scope === "user" && i.target.page === "terminal"));
});
