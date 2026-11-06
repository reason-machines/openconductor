import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_DEFAULT_MODEL, agentForModel, MODEL_CATALOG, MODEL_PALETTE, modelLabel, newChatModel, storedModel } from "./models.ts";
import { DEFAULT_SETTINGS } from "./types.ts";

test("each model id belongs to one agent, and each agent's default is in its list", () => {
  const all = Object.values(MODEL_CATALOG).flat();
  assert.equal(new Set(all).size, all.length);
  for (const [agent, model] of Object.entries(AGENT_DEFAULT_MODEL)) {
    assert.equal(agentForModel(model), agent);
  }
  assert.equal(agentForModel("opus"), "claude");
  assert.equal(agentForModel("gpt-5.3-codex-spark"), "codex");
  assert.deepEqual(Object.keys(MODEL_CATALOG), ["claude", "codex"]);
  for (const cursor of ["auto", "composer-2.5", "grok-4.7"]) assert.equal(agentForModel(cursor), null);
  assert.equal(agentForModel("llama-9"), null);
});

test("model labels are Conductor's (index lv), derived only for ids it does not know", () => {
  assert.equal(modelLabel("opus-5-5-1m"), "Opus 5.5");
  assert.equal(modelLabel("opus-5-1m"), "Opus 5");
  assert.equal(modelLabel("sonnet-5-1m"), "Sonnet 5 1M");
  assert.equal(modelLabel("haiku-4-5"), "Haiku 4.5");
  assert.equal(modelLabel("opus"), "Opus 4.8");
  assert.equal(modelLabel("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(modelLabel("gpt-5.3-codex-spark"), "GPT-5.3 Codex Spark");
  assert.equal(modelLabel("gpt-daybreak-blue-latest"), "Daybreak Blue");
  assert.equal(modelLabel("my-proxy-model"), "My Proxy Model");
});

test("palette lists are Conductor's Jf and Yy, each within the agent's catalog", () => {
  assert.equal(MODEL_PALETTE.claude.length, 12);
  assert.deepEqual(MODEL_PALETTE.codex, ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4"]);
  for (const [agent, ids] of Object.entries(MODEL_PALETTE)) for (const id of ids) assert.equal(agentForModel(id), agent);
});

test("new chats start on the saved default model and its agent", () => {
  const withModel = (m: string) => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: m } });
  assert.deepEqual(newChatModel(DEFAULT_SETTINGS), { agent: "claude", model: "opus" });
  assert.deepEqual(newChatModel(withModel("gpt-5.6-sol")), { agent: "codex", model: "gpt-5.6-sol" });
  for (const cursor of ["auto", "composer-2.5", "grok-4.7"]) {
    assert.deepEqual(newChatModel(withModel(cursor)), { agent: "claude", model: "opus" }, `${cursor} reads as the default`);
  }
  assert.deepEqual(newChatModel(withModel("my-proxy-model")), { agent: "claude", model: "my-proxy-model" });
});

test("a stored Cursor id reads as the default model, as the backend reads it", () => {
  for (const m of ["auto", "composer-2.5", "grok-4", " grok-4.7 "]) assert.equal(storedModel(m), "opus");
  assert.equal(storedModel("gpt-5.6-sol"), "gpt-5.6-sol");
  assert.equal(storedModel("my-proxy-model"), "my-proxy-model");
});
