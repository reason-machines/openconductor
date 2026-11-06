// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSubmit, chooseOption, emptyDrafts, permissionButtons, permissionHeading, permissionTool, questionAnswers, typeOther } from "./permissionPrompts.ts";
import type { Question } from "./chatRuntime.ts";

test("the card asks what the tool does, by tool name or ACP kind", () => {
  assert.equal(permissionHeading("Bash"), "Do you want to run this command?");
  assert.equal(permissionHeading("execute"), "Do you want to run this command?");
  assert.equal(permissionHeading("Edit"), "Do you want to make these changes?");
  assert.equal(permissionHeading("edit"), "Do you want to make these changes?");
  assert.equal(permissionHeading("WebFetch"), "Do you want to fetch this page?");
  assert.equal(permissionHeading("Agent"), "Do you want to run this agent?");
  assert.equal(permissionHeading("mcp__linear__x"), "Do you want to run this tool?");
});

test("the card's tool row: a Reason request's ACP kind and raw input, or a Claude Code tool by name", () => {
  const command = { command: "pnpm test src/middleware/rate-limit.test.ts", description: "Run the rate limit tests" };
  assert.deepEqual(permissionTool({ tool: "execute", title: command.command, input: command }), { name: "Bash", input: command });
  assert.deepEqual(permissionTool({ tool: "Bash", title: "Bash", input: command }), { name: "Bash", input: command });
  assert.deepEqual(permissionTool({ tool: "execute", title: "rm -rf build", input: null }), { name: "Bash", input: { command: "rm -rf build" } });
  assert.equal(permissionTool({ tool: "", title: "", input: null }), undefined);
});

test("buttons: Yes, the alternate approval, other options, then No", () => {
  const b = permissionButtons([
    { optionId: "r", name: "Reject", kind: "reject_once" },
    { optionId: "aa", name: "Always allow", kind: "allow_always" },
    { optionId: "a", name: "Allow", kind: "allow_once" },
    { optionId: "rr", name: "Never", kind: "reject_always" },
  ]);
  assert.equal(b.allow?.optionId, "a");
  assert.equal(b.alternate?.optionId, "aa");
  assert.equal(b.deny?.optionId, "r");
  assert.deepEqual(b.others.map((o) => o.optionId), ["rr"]);
  const yesNo = permissionButtons([
    { optionId: "allow", name: "Yes", kind: "allow_once" },
    { optionId: "deny", name: "No", kind: "reject_once" },
  ]);
  assert.equal(yesNo.alternate, undefined);
  assert.deepEqual(yesNo.others, []);
});

test("question drafts: single-select keeps one, multi-select toggles, Other is added", () => {
  const single: Question = { header: "DB", question: "Which?", multiSelect: false, options: [{ label: "A", description: null }, { label: "B", description: null }] };
  const multi: Question = { ...single, question: "Extras?", multiSelect: true };
  let [s, m] = emptyDrafts([single, multi]);
  assert.equal(canSubmit([s, m]), false);
  s = chooseOption(single, s, "A");
  s = chooseOption(single, s, "B");
  assert.deepEqual(s.chosen, ["B"]);
  s = typeOther(single, s, "Neither");
  assert.deepEqual(s.chosen, [], "a typed answer replaces a single choice");
  m = chooseOption(multi, m, "A");
  m = chooseOption(multi, m, "B");
  m = chooseOption(multi, m, "A");
  m = typeOther(multi, m, "  C  ");
  assert.equal(canSubmit([s, m]), true);
  assert.deepEqual(questionAnswers([s, m]), [["Neither"], ["B", "C"]]);
  assert.deepEqual(questionAnswers(emptyDrafts([single])), [[]]);
});
