import assert from "node:assert/strict";
import { test } from "node:test";
import { applyContextUpdate, contextUpdate, currentContextUsage, emptyContext, restoreContext, storeContext } from "./contextUsage.ts";
import { readFileSync } from "node:fs";
import { createChatRuntime, type Deliver } from "./chatRuntime.ts";
import { applyReasonPayload, type ReasonPayload } from "./reason.ts";

test("shared native Claude vectors pass the real TS context reducer without losing cache fields", () => {
  const cases = JSON.parse(readFileSync(new URL("../../../src-tauri/src/agent/context_usage_cases.json", import.meta.url), "utf8")) as { name: string; context: unknown[] }[];
  for (const item of cases) {
    let state = emptyContext();
    for (const update of item.context) {
      state = applyContextUpdate(state, update);
      assert.ok(contextUpdate(update), item.name);
    }
    assert.deepEqual(currentContextUsage(restoreContext(storeContext(state))), currentContextUsage(state), item.name);
  }
});

test("a replacement provider session clears persisted context instead of reviving an old sample", async () => {
  let deliver: Deliver = () => assert.fail("listener not initialized");
  const values = new Map<string, string>();
  const runtime = createChatRuntime({ canSteer: false, defaultConfig: null, sessionKey: (id) => `session.${id}`, configKey: (id) => `config.${id}`, parseConfig: () => null,
    async listen(fn) { deliver = fn; }, async open() {}, async prompt() { return {}; }, cancel() {} }, {
    persist: false, async invoke() { return null; }, recordTurnChanges() {},
    storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key) },
  });
  runtime.subscribe("replaced", () => {});
  runtime.submit("bootstrap", "/synthetic", { text: "listen" }, "queue");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const emit = (payload: ReasonPayload) => deliver("replaced", (state) => applyReasonPayload(state, payload));
  emit({ chatId: "replaced", type: "sessionStarted", sessionId: "old", resumed: false });
  emit({ chatId: "replaced", type: "contextUsage", context: { kind: "sample", totalTokens: 90, contextWindow: 100 } });
  assert.equal(runtime.snapshot("replaced").contextUsage?.totalTokens, 90);
  emit({ chatId: "replaced", type: "sessionStarted", sessionId: "new", resumed: false });
  assert.equal(runtime.snapshot("replaced").contextUsage, undefined);
});

test("context codec preserves an explicit compact boundary across reload", () => {
  let state = applyContextUpdate(emptyContext(), { kind: "sample", model: "model-a", inputTokens: 2, cacheReadInputTokens: 60, cacheCreationInputTokens: 8, outputTokens: 5, contextWindow: 100 });
  assert.equal(currentContextUsage(state)?.totalTokens, 75);
  state = applyContextUpdate(state, { kind: "reset" });
  const restored = restoreContext(storeContext(state));
  assert.deepEqual(currentContextUsage(restored), { model: "model-a", totalTokens: 0, contextWindow: 100 });
  assert.equal(currentContextUsage(restored)?.cacheReadInputTokens, undefined, "old cached count must not return after compact");
});

test("context parser accepts explicit Codex zero but ignores empty Claude samples", () => {
  assert.equal(contextUpdate({ kind: "sample", totalTokens: 0 })?.kind, "sample");
  assert.equal(contextUpdate({ kind: "sample", inputTokens: 0, outputTokens: 0 }), undefined);
  assert.equal(contextUpdate({ kind: "sample", model: "metadata-only", contextWindow: 200000 }), undefined);
  assert.equal(contextUpdate({ kind: "sample", inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 }), undefined);
  for (const totalTokens of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "12", null, true]) {
    assert.equal(contextUpdate({ kind: "sample", totalTokens }), undefined);
  }
});

test("model windows never create a sample or borrow a denominator", () => {
  let state = applyContextUpdate(emptyContext(), { kind: "window", model: "model-a", contextWindow: 100 });
  assert.equal(currentContextUsage(state), undefined);
  state = applyContextUpdate(state, { kind: "sample", model: "model-b", totalTokens: 75 });
  assert.equal(currentContextUsage(state)?.contextWindow, undefined);
  state = applyContextUpdate(state, { kind: "window", model: "model-b", contextWindow: 200 });
  assert.equal(currentContextUsage(state)?.contextWindow, 200);
  state = applyContextUpdate(state, { kind: "sample", totalTokens: 12 });
  assert.equal(currentContextUsage(state)?.contextWindow, undefined, "unattributed samples cannot inherit the last model");
});

test("saved context validates its version and numbers without coercion", () => {
  for (const value of [null, "{", "null", "[]", '{"version":2}', '{"version":1,"sample":{"totalTokens":"12"}}']) {
    assert.equal(currentContextUsage(restoreContext(value)), undefined);
  }
  const state = restoreContext('{"version":1,"sample":{"model":"safe","totalTokens":12},"windows":{"safe":100,"bad":-1,"fraction":1.5}}');
  assert.deepEqual(currentContextUsage(state), { model: "safe", totalTokens: 12, contextWindow: 100 });
  assert.deepEqual(Object.keys(state.windows), ["safe"]);
});

test("model names are inert object keys and the denominator cache is bounded", () => {
  let state = applyContextUpdate(emptyContext(), { kind: "sample", model: "constructor", totalTokens: 1 });
  assert.equal(currentContextUsage(state)?.contextWindow, undefined);
  state = applyContextUpdate(state, { kind: "window", model: "__proto__", contextWindow: 123 });
  state = applyContextUpdate(state, { kind: "sample", model: "__proto__", totalTokens: 2 });
  assert.equal(currentContextUsage(restoreContext(storeContext(state)))?.contextWindow, 123);
  for (let i = 0; i < 256; i++) state = applyContextUpdate(state, { kind: "window", model: `model-${i}`, contextWindow: i + 1 });
  assert.equal(Object.keys(state.windows).length, 128);
  assert.equal(state.windows["model-255"], 256);
});
