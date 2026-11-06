// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../../settings/types.ts";
import { choiceFromReasonConfig, conductorModelId, defaultModelChoice, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";

function memory(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
}

test("Reason model ids map back to Conductor's", () => {
  assert.equal(conductorModelId("byok:anthropic:claude-opus-5-5"), "opus-5-5-1m");
  assert.equal(conductorModelId("byok:anthropic:claude-opus-4-8"), "opus-4-8");
  assert.equal(conductorModelId("byok:openai-codex:gpt-5.6-sol"), "gpt-5.6-sol");
  assert.equal(conductorModelId("openai/gpt-6-luna"), "openai/gpt-6-luna");
});

test("a chat started from the New workspace dialog shows that model and effort", () => {
  const store = memory();
  store.setItem("openconductor.reason.config.w1", JSON.stringify([{ id: "model", value: "byok:anthropic:claude-opus-5-5" }, { id: "reasoning_effort", value: "max" }]));
  assert.deepEqual(loadModelChoice("w1", store), { model: "opus-5-5-1m", effort: "max" });
  assert.equal(choiceFromReasonConfig([{ id: "reasoning_effort", value: "low" }]), null);
});

test("a picked choice wins and round-trips", () => {
  const store = memory();
  store.setItem("openconductor.reason.config.w1", JSON.stringify([{ id: "model", value: "byok:anthropic:claude-opus-5-5" }]));
  saveModelChoice("w1", { model: "gpt-5.4", effort: "low", fast: true }, store);
  assert.deepEqual(loadModelChoice("w1", store), { model: "gpt-5.4", effort: "low", fast: true });
  assert.equal(loadModelChoice("w2", store), null);
});

test("with nothing saved the chat shows Settings › Default models", () => {
  const s = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: "opus-5-1m", claude_code: { ...DEFAULT_SETTINGS.models.claude_code, default_effort_level: "xhigh" as const } } };
  assert.deepEqual(defaultModelChoice(s), { model: "opus-5-1m", effort: "xhigh" });
});
