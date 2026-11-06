import { test } from "node:test";
import assert from "node:assert/strict";
import { chatTabStatus, chatTabUnreadDot } from "./chatTabUnread.ts";

test("an unread idle chat tab shows the dot; a read one does not (Conductor's l8i)", () => {
  assert.equal(chatTabUnreadDot(true, "idle"), true);
  assert.equal(chatTabUnreadDot(true, undefined), true, "no status reported yet counts as idle");
  assert.equal(chatTabUnreadDot(false, "idle"), false, "the dot clears once the chat is read");
});

test("the dot shows for error and cancelling, as l8i only skips working and waiting", () => {
  assert.equal(chatTabUnreadDot(true, "error"), true);
  assert.equal(chatTabUnreadDot(true, "cancelling"), true);
});

test("working, waiting and the needs_* statuses hide the dot (they draw their own icon first)", () => {
  for (const s of ["working", "waiting", "needs_plan_response", "needs_user_input", "needs_user_permission"]) {
    assert.equal(chatTabUnreadDot(true, s), false, s);
  }
});

test("a tab reads its chat's status or its Claude Code chat's, whichever is more urgent", () => {
  const statuses = new Map([
    ["app/oslo", "idle"],
    ["app/oslo:claude", "working"],
    ["app/oslo:review:1", "error"],
  ]);
  assert.equal(chatTabStatus(statuses, "app/oslo"), "working");
  assert.equal(chatTabStatus(statuses, "app/oslo:review:1"), "error");
  assert.equal(chatTabStatus(statuses, "app/oslo:chat:2"), "idle", "an unknown chat is idle");
});
