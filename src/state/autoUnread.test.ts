import { test } from "node:test";
import assert from "node:assert/strict";
import { chatInView, clearManuallyUnread, clearManuallyUnreadForWorkspace, markManuallyUnread, readOnView, selectedChatOf, setSelectedChat, unreadTarget } from "./autoUnread.ts";
import { setOpenReviewChats } from "./openChat.ts";
import { turnSettled } from "../features/chat/attention.ts";
import { emptyQueue } from "../features/chat/queue.ts";

const shown = (shownChatId: string | null, focused = true) => ({ shownChatId, focused });
const unread = (...ids: string[]) => ({ id: "app/oslo", unreadChats: ids.map((id) => ({ id, at: 1 })) });

test("a chat is in view only when it is the shown transcript and the window has focus (Conductor's QW)", () => {
  assert.equal(chatInView("app/oslo", shown("app/oslo")), true);
  assert.equal(chatInView("app/oslo", shown("app/oslo", false)), false, "window in the background");
  assert.equal(chatInView("app/oslo", shown("app/oslo:review:1")), false, "another chat of the same workspace is shown");
  assert.equal(chatInView("app/oslo", shown(null)), false, "the diff tab, or no workspace open");
});

test("attention from a chat out of view marks that chat, even while another chat of its workspace is shown", () => {
  setOpenReviewChats("app/oslo", ["app/oslo:review:2"]);
  assert.deepEqual(unreadTarget("app/oslo", shown("app/bergen")), { workspaceId: "app/oslo", chatId: "app/oslo" });
  assert.deepEqual(unreadTarget("app/oslo:review:2", shown("app/oslo")), { workspaceId: "app/oslo", chatId: "app/oslo:review:2" });
  assert.equal(unreadTarget("app/oslo", shown("app/oslo")), null, "the user is looking at it");
  assert.equal(unreadTarget("app/oslo:review:7", shown("app/bergen")), null, "a review whose tab was closed counts as hidden");
  setOpenReviewChats("app/oslo", []);
});

test("showing an unread chat with focus reads that chat only, unless the user marked it unread by hand", () => {
  const ws = unread("app/oslo", "app/oslo:review:1");
  assert.equal(readOnView(ws, shown("app/oslo")), "app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo:review:1")), "app/oslo:review:1");
  assert.equal(readOnView(unread("app/oslo:review:1"), shown("app/oslo")), null, "the shown chat is read; the other stays unread");
  assert.equal(readOnView(ws, shown("app/oslo", false)), null, "not while the window is in the background");
  assert.equal(readOnView(ws, shown(null)), null, "not while the diff tab is open");
  assert.equal(readOnView(ws, shown("app/bergen")), null, "another workspace's chat");

  markManuallyUnread("app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo")), null, "a hand mark sticks");
  assert.equal(readOnView(ws, shown("app/oslo:review:1")), "app/oslo:review:1", "hand marks are per chat");
  clearManuallyUnread("app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo")), "app/oslo", "showing it again clears the hand mark");

  markManuallyUnread("app/oslo");
  markManuallyUnread("app/oslo:review:1");
  markManuallyUnread("app/bergen");
  clearManuallyUnreadForWorkspace("app/oslo");
  assert.equal(readOnView(ws, shown("app/oslo:review:1")), "app/oslo:review:1", "Mark as read drops the workspace's hand marks");
  assert.equal(readOnView({ id: "app/bergen", unreadChats: [{ id: "app/bergen", at: 1 }] }, shown("app/bergen")), null, "other workspaces keep theirs");
  clearManuallyUnread("app/bergen");
});

test("a workspace's selected chat is its open chat tab while it is open, else its main chat", () => {
  setSelectedChat("app/oslo:review:1");
  assert.equal(selectedChatOf("app/oslo"), "app/oslo:review:1");
  assert.equal(selectedChatOf("app/lima"), "app/lima");
  setSelectedChat(null);
  assert.equal(selectedChatOf("app/oslo"), "app/oslo");
});

test("a turn settles only when it completed and nothing runs or waits after it", () => {
  const idle = emptyQueue();
  assert.equal(turnSettled("completed", idle), true);
  assert.equal(turnSettled("failed", idle), false, "Conductor marks only successful turns");
  assert.equal(turnSettled("cancelled", idle), false);
  assert.equal(turnSettled("completed", { ...idle, status: "working" }), false, "a steered or queued turn runs on");
  assert.equal(turnSettled("completed", { ...idle, items: [{ id: 1, text: "next", attachments: [], queuedAt: "x" } as never] }), false, "a paused queue still holds a message");
});
