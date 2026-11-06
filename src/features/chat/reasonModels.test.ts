// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { chipModel, modelOptions, reasonModelName, recordModels, resetModelsForTest, sessionModels, subscribeModels, type ReasonModelOption } from "./reasonModels.ts";
import { reasonModelId } from "../diff/review.ts";

function memory(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
}

// What reason acp 0.2.692 offers (trimmed), names as it gives them.
const OPTIONS: ReasonModelOption[] = [
  { value: "default", name: "Auto", description: "Your Workspace's default" },
  { value: "openai/gpt-6.1-sol", name: "Reason", description: "Included with Reason" },
  { value: "byok:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", description: "Claude · Subscription" },
  { value: "byok:anthropic:claude-opus-4-8", name: "Claude Opus 4.8", description: "Claude · Subscription" },
];

test("the chip shows the model the Session runs, not the picked alias", () => {
  // Settings' default `opus` reads "Opus 4.8" in Conductor's names, but Reason has no id for it: it runs Auto.
  assert.deepEqual(chipModel({ model: "opus", effort: "high" }, null, reasonModelId), { model: "default", effort: "high" });
  // A new Session is on Auto until its first turn.
  assert.deepEqual(chipModel({ model: "opus", effort: "high" }, { current: "default", effort: "default", options: OPTIONS }, reasonModelId), { model: "default", effort: "high" });
  // After a turn Reason names the model it ran on; its effort wins when it reports one.
  assert.deepEqual(chipModel({ model: "opus", effort: "high" }, { current: "byok:anthropic:claude-opus-5-5", effort: "low", options: OPTIONS }, reasonModelId), { model: "byok:anthropic:claude-opus-5-5", effort: "low" });
  // A picked Conductor id shows as the Reason model it runs as.
  assert.equal(chipModel({ model: "opus-5-5-1m", effort: null }, null, reasonModelId).model, "byok:anthropic:claude-opus-5-5");
});

test("names are Reason's, with fallbacks", () => {
  assert.equal(reasonModelName("byok:anthropic:claude-opus-5-5", OPTIONS), "Claude Opus 5.5");
  assert.equal(reasonModelName("default", OPTIONS), "Auto");
  assert.equal(reasonModelName("default", []), "Auto");
  // No list yet: Conductor's name for the same model.
  assert.equal(reasonModelName("byok:anthropic:claude-opus-5-5", []), "Opus 5.5");
});

test("reports are kept per chat and the last list serves chats without a Session", () => {
  resetModelsForTest();
  const store = memory();
  let calls = 0;
  const off = subscribeModels(() => calls++);
  assert.equal(sessionModels("a", store), null);
  assert.deepEqual(modelOptions("a", store), []);
  recordModels("a", { current: "default", effort: null, options: OPTIONS }, store);
  // The after-turn report carries no list: the chat keeps the one it had.
  recordModels("a", { current: "byok:anthropic:claude-opus-5-5", effort: "high", options: [] }, store);
  off();
  assert.equal(calls, 2);
  assert.equal(sessionModels("a", store)?.current, "byok:anthropic:claude-opus-5-5");
  assert.equal(sessionModels("a", store)?.options.length, 4);
  // Same object between reports (useSyncExternalStore snapshots).
  assert.equal(modelOptions("b", store), modelOptions("b", store));
  assert.equal(modelOptions("b", store).length, 4);
  // After a restart: read back from storage.
  resetModelsForTest();
  assert.equal(sessionModels("a", store)?.current, "byok:anthropic:claude-opus-5-5");
  assert.equal(modelOptions("new-chat", store)[2]?.name, "Claude Opus 5.5");
});
