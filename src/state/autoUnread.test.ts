import { test } from "node:test";
import assert from "node:assert/strict";
import { chatInView, clearManuallyUnread, markManuallyUnread, readOnView, unreadTarget } from "./autoUnread.ts";
import { turnSettled } from "../features/chat/attention.ts";
import { emptyQueue } from "../features/chat/queue.ts";

const shown = (shownChatId: string | null, focused = true) => ({ shownChatId, focused });

test("a chat is in view only when it is the shown transcript and the window has focus (Conductor's QW)", () => {
  assert.equal(chatInView("app/oslo", shown("app/oslo")), true);
  assert.equal(chatInView("app/oslo", shown("app/oslo", false)), false, "window in the background");
  assert.equal(chatInView("app/oslo", shown("app/oslo:review:1")), false, "another chat of the same workspace is shown");
  assert.equal(chatInView("app/oslo", shown(null)), false, "the diff tab, or no workspace open");
});

test("attention from a chat out of view marks its workspace; a review chat marks its own workspace", () => {
  assert.equal(unreadTarget("app/oslo", shown("app/bergen")), "app/oslo");
  assert.equal(unreadTarget("app/oslo:review:2", shown("app/oslo")), "app/oslo");
  assert.equal(unreadTarget("app/oslo", shown("app/oslo")), null);
});

test("an unread workspace shown with focus is read, unless the user marked it unread while looking at it", () => {
  const ws = { id: "app/oslo", unread: true };
  assert.equal(readOnView(ws, shown("app/oslo")), true);
  assert.equal(readOnView(ws, shown("app/oslo:review:1")), true, "its review chat is its transcript too");
  assert.equal(readOnView(ws, shown("app/oslo", false)), false, "not while the window is in the background");
  assert.equal(readOnView(ws, shown(null)), false, "not while the diff tab is open");
  assert.equal(readOnView({ id: "app/oslo" }, shown("app/oslo")), false, "already read");

  markManuallyUnread("app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo")), false, "a hand mark sticks");
  clearManuallyUnread("app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo")), true, "opening it again clears the hand mark");
});

test("a turn settles only when it completed and nothing runs or waits after it", () => {
  const idle = emptyQueue();
  assert.equal(turnSettled("completed", idle), true);
  assert.equal(turnSettled("failed", idle), false, "Conductor marks only successful turns");
  assert.equal(turnSettled("cancelled", idle), false);
  assert.equal(turnSettled("completed", { ...idle, status: "working" }), false, "a steered or queued turn runs on");
  assert.equal(turnSettled("completed", { ...idle, items: [{ id: 1, text: "next", attachments: [], queuedAt: "x" } as never] }), false, "a paused queue still holds a message");
});
