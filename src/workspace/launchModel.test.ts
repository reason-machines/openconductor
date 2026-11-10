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

test("a stored Cursor default starts on the default model; other agents have no effort levels", () => {
  assert.deepEqual(effortLevels("reason"), []);
  assert.deepEqual(launchDefaults(settings({ default: "composer-2.5" })), { agent: "claude", model: "opus", effort: "high" });
});

test("switching model keeps an effort the new agent offers, else takes that agent's default", () => {
  const s = settings({ default: "opus", codex: { ...DEFAULT_SETTINGS.models.codex, default_thinking_level: "low" } });
  const claude = { agent: "claude", model: "opus", effort: "max" };
  assert.deepEqual(chooseModel(claude, "gpt-5.5", s), { agent: "codex", model: "gpt-5.5", effort: "max" });
  assert.deepEqual(chooseModel({ ...claude, effort: "ultracode" }, "gpt-5.5", s), { agent: "codex", model: "gpt-5.5", effort: "low" });
  assert.deepEqual(chooseModel({ agent: "codex", model: "gpt-5.5", effort: "none" }, "sonnet-4-6", s), { agent: "claude", model: "sonnet-4-6", effort: "high" });
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
});

test("explicit live catalog picks retain their agent and effort without hardcoded validation", () => {
  const current = { agent: "claude", model: "opus", effort: "high" };
  assert.deepEqual(pickLaunch(current, { agent: "codex", model: "new-codex-id", effort: "adaptive" }, DEFAULT_SETTINGS), { agent: "codex", model: "new-codex-id", effort: "adaptive" });
  assert.deepEqual(pickLaunch(current, { agent: "codex", model: "new-codex-id", effort: null }, DEFAULT_SETTINGS), { agent: "codex", model: "new-codex-id", effort: "" });
});

test("launch uses only slot1, including explicit runtime and absent effort", () => {
  const favorite = { id: "a", type: "built-in" as const, agent: "codex" as const, model: "new-codex-id", fastMode: false };
  assert.deepEqual(launchDefaults(DEFAULT_SETTINGS, [favorite, null, null, null, null]), { agent: "codex", model: "new-codex-id", effort: "" });
  assert.deepEqual(launchDefaults(DEFAULT_SETTINGS, [null, favorite, null, null, null]), { agent: "reason", model: "default", effort: "" });
});

test("the loadout lists built-in favorites with their effort and skips ACP ones", () => {
  assert.deepEqual(
    loadoutPicks([
      { id: "a", type: "built-in", agent: "claude", model: "opus-5-5-1m", thinkingLevel: "max", fastMode: false },
      { id: "b", type: "acp", acpAgentId: "some-acp-agent", modelId: "x" },
      { id: "c", type: "built-in", agent: "codex", model: "gpt-5.5", fastMode: false },
    ]),
    [{ agent: "claude", model: "opus-5-5-1m", effort: "max" }, { agent: "codex", model: "gpt-5.5", effort: null }],
  );
});
