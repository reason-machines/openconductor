// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { effectiveEffort, effortLabel, fastModeAvailable, modelChip, modelDisplayName, modelEfforts, nextEffort } from "./composerModels.ts";

test("display names are Conductor's", () => {
  assert.equal(modelDisplayName("opus-5-1m"), "Opus 5");
  assert.equal(modelDisplayName("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(modelDisplayName("gpt-daybreak-blue-latest"), "Daybreak Blue");
  assert.equal(modelDisplayName("byok:anthropic:claude-opus-5-5"), "byok:anthropic:claude-opus-5-5");
});

test("Opus 5 offers Low to Ultracode under 'Effort', as the Effort submenu shows", () => {
  const e = modelEfforts("opus-5-1m")!;
  assert.equal(e.axisLabel, "Effort");
  assert.deepEqual(
    e.options.map((o) => o.label),
    ["Low", "Medium", "High", "Extra high", "Max", "Ultracode"],
  );
});

test("per-model levels and Codex's labels", () => {
  assert.deepEqual(modelEfforts("sonnet-4-6")!.options.map((o) => o.value), ["low", "medium", "high", "max"]);
  assert.equal(modelEfforts("haiku-4-5"), null);
  const sol = modelEfforts("gpt-5.6-sol")!;
  assert.equal(sol.axisLabel, "Thinking");
  assert.deepEqual(sol.options.map((o) => o.label), ["Off", "Light", "Medium", "High", "Extra high", "Max", "Ultra"]);
  assert.deepEqual(modelEfforts("gpt-5.5")!.options.map((o) => o.value), ["none", "low", "medium", "high", "xhigh"]);
});

test("an effort the model lacks falls back to the agent default", () => {
  assert.equal(effectiveEffort("sonnet-4-6", "xhigh"), "high");
  assert.equal(effectiveEffort("opus-5-1m", "max"), "max");
  assert.equal(effectiveEffort("opus-5-1m", null), "high");
  assert.equal(effortLabel("opus-5-1m", "xhigh"), "Extra high");
});

test("Cycle effort walks the levels and wraps", () => {
  assert.equal(nextEffort("opus-5-1m", "high"), "xhigh");
  assert.equal(nextEffort("opus-5-1m", "ultracode"), "low");
  assert.equal(nextEffort("haiku-4-5", "high"), null);
});

test("Fast mode: Opus and Codex models only", () => {
  assert.equal(fastModeAvailable("opus-5-1m"), true);
  assert.equal(fastModeAvailable("gpt-5.4"), true);
  assert.equal(fastModeAvailable("sonnet-4-6"), false);
});

test("the chip reads 'Opus 5' 'High', accessible 'Opus 5 · High'", () => {
  assert.deepEqual(modelChip("opus-5-1m", "high"), { label: "Opus 5", effort: "High", accessible: "Opus 5 · High" });
  assert.equal(modelChip("opus-5-1m", "high", true).accessible, "Opus 5 · High · Fast");
});
