// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, type Settings } from "../../settings/types.ts";
import { defaultChatConfig, defaultEffortSetting, sessionConfig } from "./chatModel.ts";

const withModels = (models: Partial<Settings["models"]>): Settings => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, ...models } });

test("the New workspace dialog's model and effort become the Session's options", () => {
  assert.deepEqual(sessionConfig("opus-5-5-1m", "high"), [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "high" },
  ]);
  assert.deepEqual(sessionConfig("gpt-5.6-sol", "xhigh"), [
    { id: "model", value: "byok:openai-codex:gpt-5.6-sol" },
    { id: "reasoning_effort", value: "xhigh" },
  ]);
});

test("a model or effort Reason has no value for is left to Reason's default", () => {
  assert.deepEqual(sessionConfig("opus", "high"), [{ id: "reasoning_effort", value: "high" }], "a Claude alias has no fixed Reason id");
  assert.deepEqual(sessionConfig("composer-2.5", "none"), [], "Cursor model, unknown effort");
  assert.deepEqual(sessionConfig("  ", null), []);
  assert.deepEqual(sessionConfig("opus-5-1m", "ultracode"), [
    { id: "model", value: "byok:anthropic:claude-opus-5" },
    { id: "reasoning_effort", value: "max" },
  ]);
});

test("a chat with no pick runs the default model, with its agent's default effort", () => {
  assert.deepEqual(defaultChatConfig(withModels({ default: "opus-5-5-1m" })), [{ id: "model", value: "byok:anthropic:claude-opus-5-5" }]);
  assert.deepEqual(defaultChatConfig(withModels({ default: "gpt-5.6-terra", codex: { default_thinking_level: "low", review_thinking_level: "high" } })), [
    { id: "model", value: "byok:openai-codex:gpt-5.6-terra" },
    { id: "reasoning_effort", value: "low" },
  ]);
  assert.deepEqual(defaultChatConfig(DEFAULT_SETTINGS), [], "the stored default is the `opus` alias");
});

test("a Claude default model runs with the Claude default effort (models.claude_code.default_effort_level)", () => {
  assert.deepEqual(defaultChatConfig(withModels({ default: "opus-5-5-1m", claude_code: { default_effort_level: "xhigh", review_effort_level: "low" } })), [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "xhigh" },
  ]);
  assert.deepEqual(defaultChatConfig(withModels({ default: "opus", claude_code: { default_effort_level: "ultracode" } })), [{ id: "reasoning_effort", value: "max" }]);
});

test("the New workspace dialog's effort starts from the agent's default effort setting", () => {
  const s = withModels({ claude_code: { default_effort_level: "low" }, codex: { default_thinking_level: "xhigh", review_thinking_level: "high" } });
  assert.equal(defaultEffortSetting(s, "claude"), "low");
  assert.equal(defaultEffortSetting(s, "codex"), "xhigh");
  assert.equal(defaultEffortSetting(s, "cursor"), null);
  assert.equal(defaultEffortSetting(withModels({ claude_code: {} }), "claude"), null);
});
