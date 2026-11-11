import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { AGENT_LABEL, agentForModel } from "../../settings/models.ts";
import { modelDisplayName, type ModelChoice } from "./composerModels.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import { orderedModelChoices } from "./loadoutChoices.ts";

const path = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_REGRESSION_REF}:${path}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const body = source.match(/const items = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]+)\]\);/);
assert.ok(body, "ModelPicker exposes its production items callback and dependencies");
const callback = stripTypeScriptTypes(`(() => {${body[1]}})`);
const filter = new Function("value", "favorites", "models", "query", "itemLabel", "modelName", "itemAgent", "orderedModelChoices", "modelDisplayName", "agentForModel", "AGENT_LABEL", `return ${callback}();`);

const opus: ModelChoice = { model: "opus-5-1m", effort: "high" };
const codex: ModelChoice = { model: "gpt-5.6-sol", effort: "high" };
function results(query: string, choices: readonly ModelChoice[] = [opus, codex], itemAgent?: (choice: ModelChoice) => ChatAgentId) {
  return filter(choices[0], [], choices, query, undefined, undefined, itemAgent, orderedModelChoices, modelDisplayName, agentForModel, AGENT_LABEL);
}

const originalCases = [
  ["claude", [opus]],
  ["codex", [codex]],
  ["opus", [opus]],
  ["gpt-5.6", [codex]],
  ["", [opus, codex]],
  [" \t", [opus, codex]],
] as const;

for (const [query, expected] of originalCases) {
  test(`source-only: model results for ${JSON.stringify(query)}`, () => {
    assert.deepEqual(results(query), expected);
  });
}

for (const [query, expected] of [
  [" Claude CODE ", [opus]],
  ["not an agent", []],
] as const) {
  test(`source-only: agent-label matching for ${JSON.stringify(query)}`, () => {
    assert.deepEqual(results(query), expected);
  });
}

test("source-only: explicit and callback agent identities take precedence over model catalog inference", () => {
  const reason: ModelChoice = { ...opus, agent: "reason" };
  assert.deepEqual(results("reason", [reason]), [reason]);
  assert.deepEqual(results("claude", [reason]), []);
  assert.deepEqual(results("codex", [reason], () => "codex"), [reason]);
  assert.deepEqual(results("reason", [reason], () => "codex"), []);
  assert.ok(body[2].split(",").some((dependency) => dependency.trim() === "itemAgent"), "agent identity changes invalidate memoized results");
});

test("source-only: agent search preserves matching input order and unknown IDs", () => {
  const secondOpus: ModelChoice = { model: "opus-5-5-1m", effort: null };
  assert.deepEqual(results("claude", [secondOpus, codex, opus]), [secondOpus, opus]);
  const unknown: ModelChoice = { model: "custom-model", effort: null };
  assert.deepEqual(results("custom-model", [unknown]), [unknown]);
  assert.deepEqual(results("claude", [unknown]), []);
});

for (const [query, expected] of [
  ["opus claude", [opus]],
  [" CLAUDE\t \n opus ", [opus]],
  ["codex sol", [codex]],
  ["gpt sol", [codex]],
  ["opus missing", []],
  ["claude gpt", []],
] as const) {
  test(`source-only: every model-search word matches the same result for ${JSON.stringify(query)}`, () => {
    assert.deepEqual(results(query), expected);
  });
}

test("source-only: multiword search preserves matching input order", () => {
  const secondOpus: ModelChoice = { model: "opus-5-5-1m", effort: null };
  assert.deepEqual(results("opus claude", [secondOpus, codex, opus]), [secondOpus, opus]);
});

test("source-only: multiword search preserves explicit and callback agent precedence", () => {
  const reason: ModelChoice = { ...opus, agent: "reason" };
  assert.deepEqual(results("reason opus", [reason]), [reason]);
  assert.deepEqual(results("claude opus", [reason]), []);
  assert.deepEqual(results("codex opus", [reason], () => "codex"), [reason]);
  assert.deepEqual(results("reason opus", [reason], () => "codex"), []);
});

test("source-only: multiword search uses supplied names and keeps unknown model IDs", () => {
  const custom: ModelChoice = { model: "custom-model", effort: null, agent: "reason" };
  const named = filter(custom, [], [custom], "north reason", () => "North Star", undefined, undefined, orderedModelChoices, modelDisplayName, agentForModel, AGENT_LABEL);
  assert.deepEqual(named, [custom]);
  assert.deepEqual(results("custom model", [custom]), [custom]);
  assert.deepEqual(results("custom claude", [custom]), []);
});
