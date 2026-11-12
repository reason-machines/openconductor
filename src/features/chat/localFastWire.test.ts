import assert from "node:assert/strict";
import { test } from "node:test";
import { localModelOptions, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

const supported = [
  { agent: "claude", model: "opus-5-1m", effort: "high" },
  { agent: "codex", model: "gpt-5.4", effort: "high" },
] as const;

for (const choice of supported) {
  for (const fast of [true, false]) {
    test(`local Fast carrier ${choice.agent} preserves saved ${fast ? "on" : "off"} with model and effort`, () => {
      const store = memory();
      saveModelChoice("local-carrier", { ...choice, fast }, store);
      const saved = loadModelChoice("local-carrier", store);
      assert.ok(saved);
      assert.equal(Boolean(saved.fast), fast);
      assert.deepEqual(localModelOptions("local-carrier", choice.agent, store), {
        model: choice.model,
        effort: choice.effort,
        fastMode: fast,
      });
    });
  }

  test(`local Fast carrier ${choice.agent} never leaks to the other local agent`, () => {
    const store = memory();
    saveModelChoice("other-agent", { ...choice, fast: true }, store);
    const other = choice.agent === "claude" ? "codex" : "claude";
    assert.deepEqual(localModelOptions("other-agent", other, store), {});
  });
}

test("local Fast carrier leaves an explicit Reason choice outside both local adapters", () => {
  const store = memory();
  saveModelChoice("reason-carrier", { agent: "reason", model: "gpt-5.4", effort: "high", fast: true }, store);
  assert.deepEqual(localModelOptions("reason-carrier", "claude", store), {});
  assert.deepEqual(localModelOptions("reason-carrier", "codex", store), {});
});

test("local Fast carrier does not invent a choice for an untouched chat", () => {
  const store = memory();
  assert.equal(loadModelChoice("untouched-carrier", store), null);
  assert.deepEqual(localModelOptions("untouched-carrier", "claude", store), {});
  assert.deepEqual(localModelOptions("untouched-carrier", "codex", store), {});
});

test("local Fast carrier does not forward a stale enabled flag for an unsupported Claude model", () => {
  const store = memory();
  saveModelChoice("unsupported-carrier", { agent: "claude", model: "sonnet-5-1m", effort: "high", fast: true }, store);
  assert.deepEqual(localModelOptions("unsupported-carrier", "claude", store), { model: "sonnet-5-1m", effort: "high" });
});
