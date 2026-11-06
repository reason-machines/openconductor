// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO, loadCachedModels, loadRunningModel, modelEntries, parseModelOptions, reasonChoice, reasonModelFor, reasonModelName, saveCachedModels, saveRunningModel, shownModel } from "./reasonModels.ts";
import { modelChip, modelEfforts, nextEffort } from "./composerModels.ts";
import { sessionConfig } from "./chatModel.ts";

// Trimmed from `session/new` of `reason acp` 0.2.692 on Sven's Mac.
const OFFERED = parseModelOptions([
  { value: "default", name: "Auto", description: "Your Workspace's default" },
  { value: "openai/gpt-6.1-sol", name: "Reason", description: "Included with Reason" },
  { value: "byok:anthropic:claude-opus-5-5", name: "Claude Opus 5.5", description: "Claude · Subscription" },
  { value: "byok:anthropic:claude-haiku-5-5", name: "Claude Haiku 5.5", description: "Claude · Subscription" },
  { value: "byok:openai-codex:gpt-5.6-sol", name: "GPT-5.6-Sol", description: "ChatGPT · Subscription" },
  { value: 7, name: "broken" },
]);

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

test("the default model `opus` runs Auto, not a fixed Opus: the chip no longer says Opus 4.8", () => {
  // Settings' stored default is the Claude alias `opus`, which Reason has no id for.
  const shown = shownModel(null, { model: "opus", effort: "high" });
  assert.deepEqual(shown, { model: AUTO, effort: "high" });
  assert.equal(reasonModelName(shown.model, OFFERED), "Auto");
  assert.equal(modelChip(shown.model, shown.effort, false, reasonModelName(shown.model, OFFERED)).accessible, "Auto · High");
});

test("once a turn ran, the chip shows the model and effort the Session reported", () => {
  const shown = shownModel({ model: "byok:anthropic:claude-opus-5-5", effort: "high" }, { model: "opus", effort: "high" });
  assert.deepEqual(shown, { model: "byok:anthropic:claude-opus-5-5", effort: "high" });
  const chip = modelChip(shown.model, shown.effort, false, reasonModelName(shown.model, OFFERED));
  assert.deepEqual(chip, { label: "Claude Opus 5.5", effort: "High", accessible: "Claude Opus 5.5 · High" });
  // Auto can run a model the chat never picked.
  const auto = shownModel({ model: "byok:anthropic:claude-haiku-5-5", effort: "low" }, { model: "default", effort: null });
  assert.equal(modelChip(auto.model, auto.effort, false, reasonModelName(auto.model, OFFERED)).accessible, "Claude Haiku 5.5 · Low");
});

test("Conductor ids are shown as the Reason models they run as", () => {
  assert.equal(reasonModelFor("opus-5-5-1m"), "byok:anthropic:claude-opus-5-5");
  assert.equal(reasonModelFor("gpt-5.6-sol"), "byok:openai-codex:gpt-5.6-sol");
  assert.equal(reasonModelFor("composer-2.5"), AUTO, "a removed Cursor id has no Reason model");
  assert.deepEqual(reasonChoice({ model: "opus-5-1m", effort: "ultracode" }), { model: "byok:anthropic:claude-opus-5", effort: "max" });
  assert.equal(reasonModelName("byok:anthropic:claude-opus-5-5", OFFERED), "Claude Opus 5.5");
  // Not in Reason's list (not loaded yet, or not offered): a name made from the id.
  assert.equal(reasonModelName("byok:anthropic:claude-opus-5", []), "Claude Opus 5");
  assert.equal(reasonModelName("byok:openai-codex:gpt-5.6-sol", []), "GPT-5.6 Sol");
  assert.equal(reasonModelName("byok:kimi-coding:k3", []), "k3");
  assert.equal(reasonModelName(AUTO, []), "Auto");
});

test("the picker lists every model Reason offers, Auto first", () => {
  assert.deepEqual(
    modelEntries(OFFERED).map((e) => e.model),
    ["default", "openai/gpt-6.1-sol", "byok:anthropic:claude-opus-5-5", "byok:anthropic:claude-haiku-5-5", "byok:openai-codex:gpt-5.6-sol"],
  );
  assert.equal(OFFERED[2]?.description, "Claude · Subscription");
});

test("Reason models offer Reason's reasoning levels, with none assumed until picked", () => {
  const e = modelEfforts("byok:anthropic:claude-opus-5-5");
  assert.deepEqual(e?.options.map((o) => o.value), ["minimal", "low", "medium", "high", "xhigh", "max"]);
  assert.equal(e?.defaultLevel, null);
  assert.equal(modelChip(AUTO, null).effort, null);
  assert.equal(nextEffort(AUTO, null), "minimal");
  assert.equal(nextEffort(AUTO, "max"), "minimal");
});

test("a pick of Auto is sent, so it reaches a Session running another model", () => {
  assert.deepEqual(sessionConfig(AUTO, null), [{ id: "model", value: "default" }]);
  assert.deepEqual(sessionConfig("byok:anthropic:claude-opus-5-5", "high"), [
    { id: "model", value: "byok:anthropic:claude-opus-5-5" },
    { id: "reasoning_effort", value: "high" },
  ]);
});

test("the running model and the model list are kept across restarts", () => {
  const store = memoryStore();
  assert.equal(loadRunningModel("c", store), null);
  saveRunningModel("c", { model: "byok:anthropic:claude-opus-5-5", effort: "high" }, store);
  assert.deepEqual(loadRunningModel("c", store), { model: "byok:anthropic:claude-opus-5-5", effort: "high" });
  saveRunningModel("c", null, store);
  assert.equal(loadRunningModel("c", store), null);
  saveCachedModels(OFFERED, store);
  assert.deepEqual(loadCachedModels(store), OFFERED);
  store.setItem("openconductor.reason.models", "{not json");
  assert.deepEqual(loadCachedModels(store), []);
});

test("before a turn the chip shows Settings › Agents › Reason's model by Reason's name, not the Claude alias", async () => {
  const { defaultModelChoice } = await import("./chatModelChoice.ts");
  const { DEFAULT_SETTINGS } = await import("../../settings/types.ts");
  const s = { ...DEFAULT_SETTINGS, reason: { model: "byok:anthropic:claude-opus-5-5", reasoning_effort: "high" } };
  const shown = shownModel(null, defaultModelChoice(s));
  assert.deepEqual(shown, { model: "byok:anthropic:claude-opus-5-5", effort: "high" });
  assert.equal(reasonModelName(shown.model, []), "Claude Opus 5.5");
  // What the Session reports after a turn replaces it.
  assert.deepEqual(shownModel({ model: "byok:anthropic:claude-haiku-5-5", effort: "low" }, defaultModelChoice(s)).model, "byok:anthropic:claude-haiku-5-5");
});

test("a Session model in session get's spelling is the offered model it names (reason 0.2.693)", () => {
  // Read on Sven's Mac in Reason Tests: the model option lists byok ids, `session get --json` reports provider/model with dots.
  const offered = [
    { value: "default", name: "Auto" },
    { value: "openai/gpt-6.1-sol", name: "Reason" },
    { value: "byok:openai-codex:gpt-6.1-sol", name: "GPT-6.1-Sol" },
    { value: "byok:anthropic:claude-opus-5-5", name: "Claude Opus 5.5" },
  ];
  const shown = shownModel({ model: "anthropic/claude-opus-5.5", effort: "high" }, { model: "opus", effort: null }, offered);
  assert.deepEqual(shown, { model: "byok:anthropic:claude-opus-5-5", effort: "high" });
  assert.equal(reasonModelName("anthropic/claude-opus-5.5", offered), "Claude Opus 5.5");
  assert.equal(reasonModelName("anthropic/claude-opus-5.5", []), "Claude Opus 5.5", "named without the list too");
  assert.equal(shownModel({ model: "openai/gpt-6.1-sol", effort: null }, { model: "opus", effort: null }, offered).model, "openai/gpt-6.1-sol", "an exact value is kept");
  assert.equal(shownModel({ model: "kimi/k3", effort: null }, { model: "opus", effort: null }, offered).model, "kimi/k3");
});
