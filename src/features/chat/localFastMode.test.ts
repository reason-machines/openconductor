import assert from "node:assert/strict";
import { test } from "node:test";
import { agentForModel } from "../../settings/models.ts";
import { agentForPick } from "./chatAgentChoice.ts";
import { localModelOptions, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import { fastModeAvailable } from "./composerModels.ts";
import { commandSet } from "./slashCommands.ts";

const eligible = [
  { agent: "claude", model: "opus-5-1m", effort: "high" },
  { agent: "codex", model: "gpt-5.4", effort: "high" },
] as const;
const unsupported = ["sonnet-5-1m", "haiku-4-5"] as const;

function memory() {
  const values = new Map<string, string>();
  const writes: { key: string; value: string }[] = [];
  return {
    writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
      writes.push({ key, value });
    },
  };
}

for (const choice of eligible) {
  test(`local Fast source control: recognized ${choice.agent}/${choice.model} capability`, () => {
    assert.equal(agentForModel(choice.model), choice.agent);
    assert.equal(fastModeAvailable(choice.model), true);
  });

  test(`local Fast storage control: ${choice.agent} keeps explicit identity through on/off`, () => {
    const store = memory();
    saveModelChoice("local-fast", choice, store);
    assert.equal(Boolean(loadModelChoice("local-fast", store)?.fast), false);
    store.writes.length = 0;
    for (const fast of [true, false]) {
      saveModelChoice("local-fast", { ...choice, fast }, store);
      const saved = loadModelChoice("local-fast", store);
      assert.ok(saved);
      assert.equal(saved.agent, choice.agent);
      assert.equal(saved.model, choice.model);
      assert.equal(saved.effort, choice.effort);
      assert.equal(Boolean(saved.fast), fast);
      assert.equal(agentForPick(saved), choice.agent);
    }
    assert.equal(store.writes.length, 2);
    assert.equal(new Set(store.writes.map(write => write.key)).size, 1);
  });

  test(`local Fast routing control: explicit Reason ${choice.model} stays outside local options`, () => {
    const store = memory();
    saveModelChoice("reason-fast", { ...choice, agent: "reason", fast: true }, store);
    const saved = loadModelChoice("reason-fast", store);
    assert.ok(saved);
    assert.equal(agentForPick(saved), "reason");
    assert.deepEqual(localModelOptions("reason-fast", "claude", store), {});
    assert.deepEqual(localModelOptions("reason-fast", "codex", store), {});
  });

  test(`local Fast command constructor control: ${choice.agent} remains conditional and reported commands shadow it`, () => {
    const absent = commandSet({ agent: choice.agent });
    assert.equal(absent.some(command => command.effect === "toggle_fast_mode"), false);
    const configured = commandSet({ agent: choice.agent, fastMode: { isFastMode: false } });
    const fast = configured.filter(command => command.name === "fast");
    assert.equal(fast.length, 1);
    assert.equal(fast[0]?.effect, "toggle_fast_mode");
    assert.deepEqual(fast[0]?.supportedAgents, [choice.agent]);
    const reported = commandSet({
      agent: choice.agent,
      fastMode: { isFastMode: false },
      agentCommands: [{ name: "fast", description: "Reported local command" }],
    }).filter(command => command.name === "fast");
    assert.equal(reported.length, 1);
    assert.equal(reported[0]?.effect, "agent");
  });
}

for (const model of unsupported) {
  test(`local Fast source control: recognized unsupported Claude ${model}`, () => {
    assert.equal(agentForModel(model), "claude");
    assert.equal(fastModeAvailable(model), false);
  });
}
