// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addInteraction,
  canSubmit,
  chatSessionStatus,
  chooseOption,
  emptyDrafts,
  permissionButtons,
  permissionHeading,
  questionAnswers,
  resolveInteraction,
  typeOther,
  type Interaction,
  type Question,
} from "./interactions.ts";

const permission: Interaction = {
  id: "perm-1",
  request: { kind: "permission", tool: "execute", title: "bash: ls", input: null, options: [] },
};
const plan: Interaction = { id: "req-2", request: { kind: "plan", plan: "1. do it" } };
const question: Interaction = { id: "req-3", request: { kind: "question", questions: [] } };

test("a waiting interaction sets the status; answering it goes back to the turn's status", () => {
  assert.equal(chatSessionStatus("working", []), "working");
  assert.equal(chatSessionStatus("working", [permission]), "needs_user_permission");
  assert.equal(chatSessionStatus("working", [question]), "needs_user_input");
  assert.equal(chatSessionStatus("working", [plan]), "needs_plan_response");
  const waiting = resolveInteraction(addInteraction([], permission), "perm-1");
  assert.deepEqual(waiting, []);
  assert.equal(chatSessionStatus("working", waiting), "working");
});

test("the most urgent interaction wins, and Stop shows cancelling", () => {
  // Conductor's order: plan, permission, input.
  assert.equal(chatSessionStatus("working", [question, permission]), "needs_user_permission");
  assert.equal(chatSessionStatus("working", [question, permission, plan]), "needs_plan_response");
  assert.equal(chatSessionStatus("cancelling", [permission]), "cancelling");
  assert.equal(chatSessionStatus("idle", []), "idle");
  assert.equal(chatSessionStatus("error", []), "error");
});

test("an interaction with a known id is replaced, not added twice", () => {
  const again = { ...plan, request: { kind: "plan" as const, plan: "2. changed" } };
  const list = addInteraction(addInteraction([permission], plan), again);
  assert.deepEqual(list.map((i) => i.id), ["perm-1", "req-2"]);
  assert.equal(list[1], again);
});

test("the card asks what the tool does, by tool name or ACP kind", () => {
  assert.equal(permissionHeading("Bash"), "Do you want to run this command?");
  assert.equal(permissionHeading("execute"), "Do you want to run this command?");
  assert.equal(permissionHeading("Edit"), "Do you want to make these changes?");
  assert.equal(permissionHeading("edit"), "Do you want to make these changes?");
  assert.equal(permissionHeading("WebFetch"), "Do you want to fetch this page?");
  assert.equal(permissionHeading("Agent"), "Do you want to run this agent?");
  assert.equal(permissionHeading("mcp__linear__x"), "Do you want to run this tool?");
});

test("buttons: Yes, the alternate approval, other options, then No", () => {
  const b = permissionButtons([
    { id: "r", label: "Reject", kind: "reject_once" },
    { id: "aa", label: "Always allow", kind: "allow_always" },
    { id: "a", label: "Allow", kind: "allow_once" },
    { id: "rr", label: "Never", kind: "reject_always" },
  ]);
  assert.equal(b.allow?.id, "a");
  assert.equal(b.alternate?.id, "aa");
  assert.equal(b.deny?.id, "r");
  assert.deepEqual(b.others.map((o) => o.id), ["rr"]);
  const yesNo = permissionButtons([
    { id: "allow", label: "Yes", kind: "allow_once" },
    { id: "deny", label: "No", kind: "reject_once" },
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
