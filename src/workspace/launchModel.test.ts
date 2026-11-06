import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseModel, effortLevels, launchDefaults, loadoutPicks, pickLaunch } from "./launchModel.ts";
import { DEFAULT_SETTINGS, type Settings } from "../settings/types.ts";

const settings = (models: Partial<Settings["models"]>): Settings => ({ ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, ...models } });

test("starts on the default model with its agent's default effort", () => {
  const s = settings({ default: "opus-5-5-1m", claude_code: { default_effort_level: "max" } });
  assert.deepEqual(launchDefaults(s), { agent: "claude", model: "opus-5-5-1m", effort: "max" });
  const codex = settings({ default: "gpt-5.6-sol", codex: { ...DEFAULT_SETTINGS.models.codex, default_thinking_level: "xhigh" } });
  assert.deepEqual(launchDefaults(codex), { agent: "codex", model: "gpt-5.6-sol", effort: "xhigh" });
});

test("an unset Claude effort, or no settings yet, falls back to high", () => {
  assert.equal(launchDefaults(settings({ default: "opus" })).effort, "high");
  assert.deepEqual(launchDefaults(null), { agent: "claude", model: "opus", effort: "high" });
});

test("Cursor models have no effort levels", () => {
  assert.deepEqual(effortLevels("cursor"), []);
  assert.deepEqual(launchDefaults(settings({ default: "composer-2.5" })), { agent: "cursor", model: "composer-2.5", effort: "" });
});

test("switching model keeps an effort the new agent offers, else takes that agent's default", () => {
  const s = settings({ default: "opus", codex: { ...DEFAULT_SETTINGS.models.codex, default_thinking_level: "low" } });
  const claude = { agent: "claude", model: "opus", effort: "max" };
  assert.deepEqual(chooseModel(claude, "gpt-5.5", s), { agent: "codex", model: "gpt-5.5", effort: "max" });
  assert.deepEqual(chooseModel({ ...claude, effort: "ultracode" }, "gpt-5.5", s), { agent: "codex", model: "gpt-5.5", effort: "low" });
  assert.deepEqual(chooseModel(claude, "grok-4.7", s), { agent: "cursor", model: "grok-4.7", effort: "" });
  assert.deepEqual(chooseModel({ agent: "cursor", model: "grok-4.7", effort: "" }, "sonnet-4-6", s), { agent: "claude", model: "sonnet-4-6", effort: "high" });
});

test("a favorite pick applies its own effort; an effort pick keeps the model", () => {
  const s = settings({ default: "opus", codex: { ...DEFAULT_SETTINGS.models.codex, default_thinking_level: "low" } });
  const claude = { agent: "claude", model: "opus", effort: "max" };
  assert.deepEqual(pickLaunch(claude, { model: "gpt-5.5", effort: "xhigh" }, s), { agent: "codex", model: "gpt-5.5", effort: "xhigh" });
  assert.deepEqual(pickLaunch(claude, { model: "opus", effort: "low" }, s), { agent: "claude", model: "opus", effort: "low" });
  // No effort on the favorite: chooseModel's rule (keep it when offered, else the agent default).
  assert.deepEqual(pickLaunch(claude, { model: "gpt-5.5", effort: null }, s), { agent: "codex", model: "gpt-5.5", effort: "max" });
  // An effort the agent does not offer is dropped for its default.
  assert.deepEqual(pickLaunch(claude, { model: "gpt-5.5", effort: "ultracode" }, s), { agent: "codex", model: "gpt-5.5", effort: "max" });
  assert.deepEqual(pickLaunch(claude, { model: "grok-4.7", effort: "high" }, s), { agent: "cursor", model: "grok-4.7", effort: "" });
});

test("the loadout lists built-in favorites with their effort and skips ACP ones", () => {
  assert.deepEqual(
    loadoutPicks([
      { id: "a", type: "built-in", agent: "claude", model: "opus-5-5-1m", thinkingLevel: "max", fastMode: false },
      { id: "b", type: "acp", acpAgentId: "opencode", modelId: "x" },
      { id: "c", type: "built-in", agent: "cursor", model: "composer-2.5", fastMode: false },
    ]),
    [{ model: "opus-5-5-1m", effort: "max" }, { model: "composer-2.5", effort: null }],
  );
});
