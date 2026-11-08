import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "../types.ts";
import { builtIn, displayedLoadout, parseFavorites, toRows, withDefault } from "./loadout.ts";

const fresh = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default_initialized: false } };

test("a fresh loadout stays empty until a successful connection or an explicit choice", () => {
  assert.deepEqual(displayedLoadout(fresh, []), []);
});

test("a Reason choice persists the exact Reason ID and runtime in slot one", () => {
  const chosen = builtIn("reason", "byok:anthropic:claude-opus-5-5", "xhigh");
  assert.equal(chosen.agent, "reason");
  const settings = withDefault(fresh, chosen);
  assert.equal(settings.models.default_agent, "reason");
  assert.equal(settings.models.default_initialized, true);
  assert.equal(settings.reason?.model, chosen.model);
  const restored = parseFavorites(toRows([chosen]));
  assert.equal(restored.length, 1);
  assert.deepEqual(displayedLoadout(settings, restored), [chosen]);
});

test("each local runtime explicitly replaces the first-connection default without losing the other slots", () => {
  for (const [model, agent] of [["opus-5-1m", "claude"], ["gpt-5.6-sol", "codex"]]) {
    const chosen = builtIn("slot1", model);
    const settings = withDefault(fresh, chosen);
    assert.equal(settings.models.default_agent, agent);
    assert.equal(settings.models.default_initialized, true);
    const extra = builtIn("slot2", "byok:openai:gpt-6.1-terra");
    assert.deepEqual(displayedLoadout(settings, [chosen, extra]), [chosen, extra]);
  }
});

test("existing settings retain the saved model, including the legacy opus alias", () => {
  for (const model of ["opus", "sonnet-5-5-1m", "gpt-5.6-sol"]) {
    const existing = { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models, default: model } };
    const shown = displayedLoadout(existing, []);
    assert.equal(shown[0]?.type, "built-in");
    assert.equal(shown[0]?.type === "built-in" && shown[0].model, model);
  }
});
