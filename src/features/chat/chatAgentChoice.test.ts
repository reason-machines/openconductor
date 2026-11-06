// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentEntryLabel, agentForPick, CODEX_ENTRY, pickerState } from "./chatAgentChoice.ts";

const opus = { model: "opus-5-5-1m", effort: "high" };
const fallback = { model: "opus-5-1m", effort: "high" };

test("a Reason chat lists its model, the default model, then Codex", () => {
  assert.deepEqual(pickerState("reason", opus, fallback, true), { value: opus, favorites: [fallback, CODEX_ENTRY] });
});

test("without Codex (browser preview) the picker lists only models", () => {
  assert.deepEqual(pickerState("reason", opus, fallback, false), { value: opus, favorites: [fallback] });
  assert.deepEqual(pickerState("reason", fallback, fallback, false), { value: fallback, favorites: [] });
});

test("a Codex chat shows Codex on the chip and lists the Reason models to switch back", () => {
  assert.deepEqual(pickerState("codex", opus, fallback, true), { value: CODEX_ENTRY, label: "Codex", favorites: [opus, fallback] });
});

test("picking an entry picks its agent; a GPT model stays a Reason chat", () => {
  assert.equal(agentForPick(CODEX_ENTRY), "codex");
  assert.equal(agentForPick(opus), "reason");
  assert.equal(agentForPick({ model: "gpt-5.6-sol", effort: "high" }), "reason");
  assert.equal(agentEntryLabel(CODEX_ENTRY), "Codex");
  assert.equal(agentEntryLabel(opus), undefined);
});
