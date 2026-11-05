// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, type Settings } from "../../settings/types.ts";
import { chatModel, defaultEffortSetting, sessionModel } from "./sessionModel.ts";

const withModels = (models: Partial<Settings["models"]>): Settings => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, ...models } });

test("a new chat runs on models.default with the Claude default effort", () => {
  const m = chatModel(withModels({ default: "opus-5-5-1m", claude_code: { default_effort_level: "xhigh", review_effort_level: "low" } }));
  assert.deepEqual(m.config, [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "xhigh" },
  ]);
  assert.equal(m.label, "Opus 5.5 (1M)");
});

test("a Codex default model takes the Codex default thinking level, not the Claude effort", () => {
  const m = chatModel(withModels({ default: "gpt-5.6-sol", claude_code: { default_effort_level: "low" }, codex: { default_thinking_level: "medium", review_thinking_level: "high" } }));
  assert.deepEqual(m.config, [
    { id: "model", value: "byok:openai-codex:gpt-5.6-sol" },
    { id: "reasoning_effort", value: "medium" },
  ]);
});

test("without an effort setting Reason's default effort runs; a Claude alias leaves the model to Reason too", () => {
  assert.deepEqual(chatModel(withModels({ default: "sonnet-4-6", claude_code: {} })).config, [{ id: "model", value: "byok:anthropic:claude-sonnet-4-6" }]);
  assert.deepEqual(chatModel(withModels({ default: "opus", claude_code: { default_effort_level: "max" } })).config, [{ id: "reasoning_effort", value: "max" }]);
});

test("the Create-workspace dialog's pick: a fixed model and effort, ultracode as Reason's top level", () => {
  assert.deepEqual(sessionModel("opus-5-1m", () => "ultracode").config, [
    { id: "model", value: "byok:anthropic:claude-opus-5" },
    { id: "reasoning_effort", value: "max" },
  ]);
  assert.deepEqual(sessionModel("opus-5-1m", () => "bogus").config, [{ id: "model", value: "byok:anthropic:claude-opus-5" }]);
});

test("the dialog's effort comes from the agent's default effort setting", () => {
  const s = withModels({ claude_code: { default_effort_level: "low" }, codex: { default_thinking_level: "xhigh", review_thinking_level: "high" } });
  assert.equal(defaultEffortSetting(s, "claude"), "low");
  assert.equal(defaultEffortSetting(s, "codex"), "xhigh");
  assert.equal(defaultEffortSetting(s, "cursor"), null);
  assert.equal(defaultEffortSetting(withModels({ claude_code: {} }), "claude"), null);
});
