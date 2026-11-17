import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import fuzzysort from "fuzzysort";
import { AGENT_LABEL, agentForModel } from "../../settings/models.ts";
import { modelDisplayName, type ModelChoice } from "./composerModels.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import { orderedModelChoices } from "./loadoutChoices.ts";
import { matchCommands } from "./slashCommands.ts";

const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_FUZZY_REGRESSION_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_FUZZY_REGRESSION_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(new URL("./ModelPicker.tsx", import.meta.url), "utf8");
const body = source.match(/const items = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]+)\]\);/);
assert.ok(body, "execute the actual production items callback, not a replacement predicate");
const filter = new Function(
  "value", "favorites", "models", "query", "itemLabel", "modelName", "itemAgent",
  "orderedModelChoices", "modelDisplayName", "agentForModel", "AGENT_LABEL", "fuzzysort",
  `return ${stripTypeScriptTypes(`(() => {${body[1]}})`)}();`,
);
const opus: ModelChoice = { model: "opus-5-1m", effort: "high", agent: "claude" };
const codex: ModelChoice = { model: "gpt-5.6-sol", effort: "high", agent: "codex" };

function results(query: string, choices: readonly ModelChoice[] = [opus, codex], itemAgent?: (choice: ModelChoice) => ChatAgentId): ModelChoice[] {
  return filter(choices[0], [], choices, query, undefined, undefined, itemAgent, orderedModelChoices, modelDisplayName, agentForModel, AGENT_LABEL, fuzzysort);
}

// The retained A7o -> R7o -> lj chain searches this combined entry text.
// Use our existing, independently implemented lj adapter; never execute the
// extracted Conductor code. No app, browser, native or provider is involved.
function referenceMembership(query: string): string[] {
  const commands = [opus, codex].map((choice) => ({
    name: `${modelDisplayName(choice.model)} ${AGENT_LABEL[choice.agent as "claude" | "codex"]} ${choice.agent}:${choice.model}`,
    description: "", argumentHint: "", effect: "agent" as const, supportedAgents: [], id: choice.model,
  }));
  const matches = new Set(matchCommands(commands, query).map((match) => match.command.id));
  return [opus, codex].filter((choice) => matches.has(choice.model)).map((choice) => choice.model);
}

for (const [query, expected] of [
  ["cld", [opus]],
  ["cdx", [codex]],
  ["gpt56", [codex]],
] as const) {
  test(`abbreviated model search retains the ${query} result`, () => {
    assert.deepEqual(referenceMembership(query), expected.map((choice) => choice.model), "retained contract agrees with our existing pure lj adapter");
    assert.deepEqual(results(query), expected);
  });
}

for (const [query, expected] of [
  ["opus", [opus]],
  ["codex", [codex]],
  ["opus claude", [opus]],
  [" CLAUDE\t \n opus ", [opus]],
  ["", [opus, codex]],
  [" \t", [opus, codex]],
  ["no matching model", []],
] as const) {
  test(`model search preserves the existing ${JSON.stringify(query)} control`, () => {
    assert.deepEqual(results(query), expected);
  });
}

test("literal model search ranks results and preserves choice identity", () => {
  const secondOpus: ModelChoice = { model: "opus-5-5-1m", effort: "max", fast: true, agent: "claude" };
  const matching = results("opus", [secondOpus, codex, opus]);
  assert.deepEqual(matching, [opus, secondOpus]);
  assert.equal(matching[0], opus);
  assert.equal(matching[1], secondOpus);
});

test("provider identity still uses the explicit agent and callback precedence", () => {
  const reason: ModelChoice = { ...opus, agent: "reason" };
  assert.deepEqual(results("reason", [reason]), [reason]);
  assert.deepEqual(results("claude", [reason]), []);
  assert.deepEqual(results("codex", [reason], () => "codex"), [reason]);
  assert.deepEqual(results("reason", [reason], () => "codex"), []);
});
