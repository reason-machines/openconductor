// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "../../settings/types.ts";
import { choiceFromReasonConfig, conductorModelId, copyModelChoice, defaultModelChoice, initializeLoadoutChoice, localModelOptions, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import { agentForPick, CLAUDE_ENTRY, CODEX_ENTRY, pickerState } from "./chatAgentChoice.ts";

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

test("new chats seed only physical slot1 and preserve model/agent/effort across reload", () => {
  const store = memory();
  const first = { id: "a", type: "built-in" as const, agent: "codex" as const, model: "live-dynamic-codex", thinkingLevel: "ultra", fastMode: false };
  const second = { ...first, id: "b", agent: "claude" as const, model: "future-claude" };
  initializeLoadoutChoice("new", [first, second, null, null, null], store);
  assert.deepEqual(loadModelChoice("new", store), { agent: "codex", model: "live-dynamic-codex", effort: "ultra" });
  assert.equal(store.getItem("openconductor.agent.new"), "codex");
  assert.deepEqual(localModelOptions("new", "codex", store), { model: "live-dynamic-codex", effort: "ultra" });
  assert.deepEqual(localModelOptions("new", "claude", store), {});
  initializeLoadoutChoice("new", [second], store);
  assert.equal(loadModelChoice("new", store)?.model, "live-dynamic-codex", "existing chats are not reseeded");
  initializeLoadoutChoice("hole", [null, second, null, null, null], store);
  assert.deepEqual(loadModelChoice("hole", store), { agent: "reason", model: "default", effort: null });
});

test("agent-only picker choices preserve the named chip and leave runtime model selection unset", () => {
  for (const [entry, label] of [[CODEX_ENTRY, "Codex"], [CLAUDE_ENTRY, "Claude Code"]] as const) {
    const store = memory();
    saveModelChoice("agent-only", entry, store);
    const saved = loadModelChoice("agent-only", store);
    assert.ok(saved);
    assert.deepEqual(saved, entry);
    const agent = agentForPick(saved);
    assert.equal(pickerState(agent, saved, null, true).label, label);
    assert.deepEqual(localModelOptions("agent-only", "codex", store), {});
    assert.deepEqual(localModelOptions("agent-only", "claude", store), {});
    copyModelChoice("agent-only", "agent-fork", agent, [], store);
    assert.deepEqual(loadModelChoice("agent-fork", store), entry);
    assert.deepEqual(localModelOptions("agent-fork", "codex", store), {});
    assert.deepEqual(localModelOptions("agent-fork", "claude", store), {});
    copyModelChoice("missing", "default-fork", agent, [], store);
    assert.deepEqual(loadModelChoice("default-fork", store), entry);
  }
});

test("an explicit dynamic local model without effort does not acquire an inferred level", () => {
  const store = memory();
  saveModelChoice("blank-effort", { agent: "claude", model: "live-id", effort: null }, store);
  assert.deepEqual(localModelOptions("blank-effort", "claude", store), { model: "live-id" });
});

test("forking replaces the destination loadout default with source options and agent", () => {
  const store = memory();
  saveModelChoice("target", { agent: "codex", model: "unrelated-default", effort: "high" }, store);
  saveModelChoice("source", { agent: "reason", model: "byok:provider:model", effort: "low", fast: true }, store);
  copyModelChoice("source", "target", "reason", [], store);
  assert.deepEqual(loadModelChoice("target", store), loadModelChoice("source", store));
  assert.equal(store.getItem("openconductor.agent.target"), "reason");
  copyModelChoice("missing", "auto-fork", "reason", [], store);
  assert.deepEqual(loadModelChoice("auto-fork", store), { agent: "reason", model: "default", effort: null });
});

test("with nothing saved the chat shows Settings › Default models", () => {
  const s = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: "opus-5-1m", claude_code: { ...DEFAULT_SETTINGS.models.claude_code, default_effort_level: "xhigh" as const } } };
  assert.deepEqual(defaultModelChoice(s), { model: "opus-5-1m", effort: "xhigh" });
});
