import test from "node:test";
import assert from "node:assert/strict";
import { LOADOUT_COLUMNS, REASON_POPULAR, otherReasonModels } from "./reasonPalette.ts";

test("loadout columns start with Reason Machines, then Claude Code and Codex", () => {
  assert.deepEqual(LOADOUT_COLUMNS, ["reason", "claude", "codex"]);
});

test("popular models keep provider groups and the requested strongest-first order without invented IDs", () => {
  assert.deepEqual(REASON_POPULAR.map((m) => m.name), ["Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 5.5", "Opus 4.8", "GPT-6.1 Sol", "GPT-6.1 Terra", "GPT-6 Astra", "GPT-6 Luna"]);
  assert.deepEqual(REASON_POPULAR.map((m) => m.value), [
    "byok:anthropic:claude-opus-5-5", "byok:anthropic:claude-fable-5-1", "byok:anthropic:claude-sonnet-5-5", "byok:anthropic:claude-haiku-5-5", "byok:anthropic:claude-opus-4-8",
    "byok:openai:gpt-6.1-sol", "byok:openai:gpt-6.1-terra", "byok:openai:gpt-6-astra", "byok:openai:gpt-6-luna",
  ]);
  assert.equal(new Set(REASON_POPULAR.map((m) => m.value)).size, 9);
});

test("the live catalog is hidden when disconnected and searchable below the stable curated list when connected", () => {
  const rest = { value: "byok:kimi-coding:k3", name: "Kimi K3" };
  const options = [...REASON_POPULAR, rest, rest, { value: "default", name: "Auto" }];
  assert.deepEqual(otherReasonModels(false, options, ""), []);
  assert.deepEqual(otherReasonModels(true, options, ""), [rest, { value: "default", name: "Auto" }]);
  assert.deepEqual(otherReasonModels(true, options, "  KIMI  "), [rest]);
  assert.deepEqual(otherReasonModels(true, options, "opus"), []);
  assert.deepEqual(otherReasonModels(true, options, "missing"), []);
  assert.equal(REASON_POPULAR.length, 9, "connection and searches never filter the popular catalog");
});
