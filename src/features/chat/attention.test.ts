// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { codexAsks, enteredWait } from "./attention.ts";

test("entering plan review or user input is a new wait; staying in it or other statuses are not", () => {
  assert.equal(enteredWait("working", "needs_plan_response"), true, "ExitPlanMode's plan review");
  assert.equal(enteredWait("working", "needs_user_input"), true, "AskUserQuestion or an MCP elicitation");
  assert.equal(enteredWait(undefined, "needs_user_input"), true, "a chat with no status yet");
  assert.equal(enteredWait("needs_user_permission", "needs_plan_response"), true);
  // An approval answered while a question that opened under it stays open: back to that question, already signalled.
  assert.equal(enteredWait("needs_user_permission", "needs_user_input"), false);
  assert.equal(enteredWait("needs_user_input", "needs_user_input"), false, "the same wait again");
  // Tool approvals signal per request, and the other statuses are no wait on the user.
  assert.equal(enteredWait("working", "needs_user_permission"), false);
  for (const s of ["idle", "working", "cancelling", "error", "waiting"] as const) assert.equal(enteredWait("needs_user_input", s), false, s);
});

const none = { approvals: [], consents: [], status: "working" as const };

test("Codex: a new approval or consent asks once; a consent that entered needs_user_input is left to the status", () => {
  // A tool approval moves the chat to needs_user_permission: signalled here.
  assert.equal(codexAsks(none, { approvals: [{ requestId: 1 }], consents: [], status: "needs_user_permission" }), true);
  // A first consent moves the chat to needs_user_input: reportChatStatus signals it (enteredWait).
  assert.equal(codexAsks(none, { approvals: [], consents: [{ requestId: 7 }], status: "needs_user_input" }), false);
  // A second consent while the first waits keeps the status: signalled here.
  assert.equal(
    codexAsks({ approvals: [], consents: [{ requestId: 7 }], status: "needs_user_input" }, { approvals: [], consents: [{ requestId: 7 }, { requestId: 8 }], status: "needs_user_input" }),
    true,
  );
  // A consent while a tool approval is open stays needs_user_permission (the approval outranks it): signalled here.
  assert.equal(
    codexAsks({ approvals: [{ requestId: 1 }], consents: [], status: "needs_user_permission" }, { approvals: [{ requestId: 1 }], consents: [{ requestId: 7 }], status: "needs_user_permission" }),
    true,
  );
  // The same request again, or one answered, asks nothing.
  const open = { approvals: [{ requestId: 1 }], consents: [{ requestId: 7 }], status: "needs_user_permission" as const };
  assert.equal(codexAsks(open, open), false);
  assert.equal(codexAsks(open, { approvals: [], consents: [{ requestId: 7 }], status: "needs_user_input" }), false);
});
