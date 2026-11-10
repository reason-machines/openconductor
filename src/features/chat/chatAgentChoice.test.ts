// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentEntryLabel, agentForPick, CLAUDE_ENTRY, CODEX_ENTRY, pickerState } from "./chatAgentChoice.ts";
import type { ModelChoice } from "./composerModels.ts";

const opus = { model: "opus-5-5-1m", effort: "high" };
const fallback = { model: "opus-5-1m", effort: "high" };

test("a Reason chat lists its model, the default model, then Codex and Claude Code", () => {
  assert.deepEqual(pickerState("reason", opus, fallback, true), { value: opus, favorites: [fallback, CODEX_ENTRY, CLAUDE_ENTRY] });
});

test("without the CLI agents (browser preview) the picker lists only models", () => {
  assert.deepEqual(pickerState("reason", opus, fallback, false), { value: opus, favorites: [fallback] });
  assert.deepEqual(pickerState("reason", fallback, fallback, false), { value: fallback, favorites: [] });
});

test("a Codex chat shows Codex on the chip and lists the Reason models and Claude Code to switch to", () => {
  assert.deepEqual(pickerState("codex", opus, fallback, true), { value: CODEX_ENTRY, label: "Codex", favorites: [opus, fallback, CLAUDE_ENTRY] });
});

test("a Claude Code chat shows Claude Code on the chip and lists the Reason models and Codex to switch to", () => {
  assert.deepEqual(pickerState("claude", opus, fallback, true), { value: CLAUDE_ENTRY, label: "Claude Code", favorites: [opus, fallback, CODEX_ENTRY] });
});

test("while a turn runs (agents locked) a CLI chat lists only the Reason models", () => {
  assert.deepEqual(pickerState("claude", opus, fallback, false), { value: CLAUDE_ENTRY, label: "Claude Code", favorites: [opus, fallback] });
});

test("loadout entries retain explicit agents and hide unavailable agent switches", () => {
  const reason: ModelChoice = { agent: "reason", model: "shared-id", effort: "high" };
  const claude: ModelChoice = { ...reason, agent: "claude" };
  const codex: ModelChoice = { ...reason, agent: "codex" };
  const loadout = [claude, reason, codex];
  assert.deepEqual(pickerState("reason", reason, null, false, loadout).favorites, [reason]);
  assert.deepEqual(pickerState("reason", reason, null, true, loadout).favorites.slice(0, 3), loadout);
  assert.deepEqual(pickerState("claude", claude, null, false, loadout).favorites, [claude, claude]);
  assert.equal(agentForPick(reason), "reason");
  assert.equal(agentForPick(claude), "claude");
  assert.equal(agentForPick(codex), "codex");
});

test("picking an entry picks its agent; a GPT or Claude model stays a Reason chat", () => {
  assert.equal(agentForPick(CODEX_ENTRY), "codex");
  assert.equal(agentForPick(CLAUDE_ENTRY), "claude");
  assert.equal(agentForPick(opus), "reason");
  assert.equal(agentForPick({ model: "gpt-5.6-sol", effort: "high" }), "reason");
  assert.equal(agentEntryLabel(CODEX_ENTRY), "Codex");
  assert.equal(agentEntryLabel(CLAUDE_ENTRY), "Claude Code");
  assert.equal(agentEntryLabel(opus), undefined);
});
