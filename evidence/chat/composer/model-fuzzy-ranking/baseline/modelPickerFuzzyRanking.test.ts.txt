import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import fuzzysort from "fuzzysort";

// Repository-root imports keep this frozen qualifier portable without evaluating
// the retained vendor code. Only OpenConductor's existing pure adapters run.
const moduleAt = (path: string) => import(pathToFileURL(resolve(path)).href);
const { AGENT_LABEL, agentForModel } = await moduleAt("src/settings/models.ts");
const { modelDisplayName } = await moduleAt("src/features/chat/composerModels.ts");
const { orderedModelChoices } = await moduleAt("src/features/chat/loadoutChoices.ts");
const { matchCommands } = await moduleAt("src/features/chat/slashCommands.ts");
type Choice = { model: string; agent: string; effort: string | null; fast?: boolean };
const sourcePath = "src/features/chat/ModelPicker.tsx";
const source = process.env.MODEL_PICKER_RANK_REF
  ? execFileSync("git", ["show", `${process.env.MODEL_PICKER_RANK_REF}:${sourcePath}`], { encoding: "utf8" })
  : readFileSync(sourcePath, "utf8");
const body = source.match(/const items = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[([^\]]+)\]\);/);
assert.ok(body, "qualify the actual production items callback");
const filter = new Function(
  "value", "favorites", "models", "query", "itemLabel", "modelName", "itemAgent",
  "orderedModelChoices", "modelDisplayName", "agentForModel", "AGENT_LABEL", "fuzzysort",
  `return ${stripTypeScriptTypes(`(() => {${body[1]}})`)}();`,
);
const opus: Choice = { model: "opus-5-1m", effort: "high", agent: "claude" };
const secondOpus: Choice = { model: "opus-5-5-1m", effort: "max", fast: true, agent: "claude" };
const codex: Choice = { model: "gpt-5.6-sol", effort: "high", agent: "codex" };
const choices = [secondOpus, codex, opus];
function results(query: string, list: Choice[] = choices, itemAgent?: (choice: Choice) => string) {
  return filter(list[0], [], list, query, undefined, undefined, itemAgent,
    orderedModelChoices, modelDisplayName, agentForModel, AGENT_LABEL, fuzzysort) as Choice[];
}
function ownReferenceOrder(query: string) {
  const commands = choices.map((choice) => ({
    name: `${modelDisplayName(choice.model)} ${AGENT_LABEL[choice.agent]} ${choice.agent}:${choice.model}`,
    description: "", argumentHint: "", effect: "agent", supportedAgents: [], id: choice.model,
  }));
  return matchCommands(commands, query).map((match: { command: { id: string } }) => match.command.id);
}
for (const query of ["opus", "claude:opus", "cld", "Opus 5 Claude Code claude:opus-5-1m"]) {
  test(`filtered ${query} ranks the stronger model match before its physical loadout predecessor`, () => {
    assert.deepEqual(ownReferenceOrder(query), [opus.model, secondOpus.model], "retained lj contract via our own adapter");
    assert.deepEqual(results(query), [opus, secondOpus]);
  });
}
for (const query of ["", " \t\n"]) {
  test(`unfiltered ${JSON.stringify(query)} preserves physical order and identity`, () => {
    const actual = results(query);
    assert.deepEqual(actual, choices);
    actual.forEach((choice, index) => assert.equal(choice, choices[index]));
  });
}
for (const [query, expected] of [["cdx", [codex]], ["gpt56", [codex]], ["no matching model", []]] as const) {
  test(`${query} retains existing membership control`, () => assert.deepEqual(results(query), expected));
}
test("provider identity precedence stays separate from ranking", () => {
  const reason: Choice = { ...opus, agent: "reason" };
  assert.deepEqual(results("claude", [reason]), []);
  assert.deepEqual(results("reason", [reason]), [reason]);
  assert.deepEqual(results("codex", [reason], () => "codex"), [reason]);
  assert.deepEqual(results("reason", [reason], () => "codex"), []);
});
test("Enter from search applies the highest ranked eligible result without closing or submitting", () => {
  const keyBody = source.match(/const onMenuKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n  \};\n\n  const fastRow/);
  assert.ok(keyBody, "execute the actual production key handler");
  const input = {};
  class Button {}
  const changes: Choice[] = [];
  const queries: string[] = [];
  const opens: boolean[] = [];
  let prevented = 0, stopped = 0, focused = 0;
  const key = new Function("e", "HTMLButtonElement", "search", "query", "items", "disabled", "value", "same", "onChange", "changeQuery", "effortOpen", "setEffortOpen", "setOpen", "root",
    `return ${stripTypeScriptTypes(`(function(e: unknown) {${keyBody[1]}})`)}(e);`);
  key({ key: "Enter", nativeEvent: {}, target: input, preventDefault() { prevented++; }, stopPropagation() { stopped++; } },
    Button, { current: Object.assign(input, { focus() { focused++; } }) }, "opus", results("opus"), false,
    codex, (a: Choice, b: Choice) => a.model === b.model, (c: Choice) => changes.push(c), (q: string) => queries.push(q),
    false, () => {}, (o: boolean) => opens.push(o), { current: null });
  assert.deepEqual(changes, [opus]);
  assert.deepEqual(queries, [""]);
  assert.deepEqual(opens, []);
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(focused, 1);
});
