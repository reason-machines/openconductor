import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_DEFAULT_MODEL, agentForModel, MODEL_CATALOG, modelLabel, newChatModel } from "./models.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

test("each model id belongs to one agent, and each agent's default is in its list", () => {
  const all = Object.values(MODEL_CATALOG).flat();
  assert.equal(new Set(all).size, all.length);
  for (const [agent, model] of Object.entries(AGENT_DEFAULT_MODEL)) {
    assert.equal(agentForModel(model), agent);
  }
  assert.equal(agentForModel("opus"), "claude");
  assert.equal(agentForModel("gpt-5.3-codex-spark"), "codex");
  assert.equal(agentForModel("grok-4.7"), "cursor");
  assert.equal(agentForModel("llama-9"), null);
});

test("model labels", () => {
  assert.equal(modelLabel("opus-5-5-1m"), "Opus 5.5 (1M)");
  assert.equal(modelLabel("haiku-4-5"), "Haiku 4.5");
  assert.equal(modelLabel("opus"), "Opus");
  assert.equal(modelLabel("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(modelLabel("gpt-5.3-codex-spark"), "GPT-5.3 Codex Spark");
  assert.equal(modelLabel("gpt-daybreak-blue-latest"), "GPT-Daybreak Blue Latest");
  assert.equal(modelLabel("composer-2.5"), "Composer 2.5");
  assert.equal(modelLabel("auto"), "Auto");
});

test("new chats start on the saved default model and its agent", () => {
  const withModel = (m: string) => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: m } });
  assert.deepEqual(newChatModel(DEFAULT_SETTINGS), { agent: "claude", model: "opus" });
  assert.deepEqual(newChatModel(withModel("gpt-5.6-sol")), { agent: "codex", model: "gpt-5.6-sol" });
  assert.deepEqual(newChatModel(withModel("composer-2.5")), { agent: "cursor", model: "composer-2.5" });
  assert.deepEqual(newChatModel(withModel("my-proxy-model")), { agent: "claude", model: "my-proxy-model" });
});
