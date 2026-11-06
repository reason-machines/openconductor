import { test } from "node:test";
import assert from "node:assert/strict";
import { attentionChat, isChatUnread, isWorkspaceUnread, withChatUnread, withWorkspaceRead } from "./chatUnread.ts";
import type { Workspace } from "./types.ts";

const ws = (extra: Partial<Workspace> = {}): Workspace => ({ id: "app/oslo", name: "oslo", branch: "oslo", status: "idle", diff: { added: 0, removed: 0 }, createdAt: 1, ...extra });

test("a workspace is unread while any of its chats is (Conductor's zJo)", () => {
  assert.equal(isWorkspaceUnread(ws()), false);
  const one = withChatUnread(ws(), "app/oslo:review:1", true, 10);
  assert.equal(isWorkspaceUnread(one), true);
  assert.equal(isChatUnread(one, "app/oslo:review:1"), true);
  assert.equal(isChatUnread(one, "app/oslo"), false, "the main chat stays read");
  const two = withChatUnread(one, "app/oslo", true, 20);
  assert.deepEqual(two.unreadChats, [{ id: "app/oslo:review:1", at: 10 }, { id: "app/oslo", at: 20 }]);
  const back = withChatUnread(two, "app/oslo:review:1", false, 30);
  assert.equal(isWorkspaceUnread(back), true, "reading one chat leaves the other unread");
  assert.equal(withChatUnread(back, "app/oslo", false, 40).unreadChats, undefined, "the last read chat clears the list");
});

test("marking a read chat read changes nothing; marking an unread chat again moves its time", () => {
  const read = ws();
  assert.equal(withChatUnread(read, "app/oslo", false, 5), read);
  const again = withChatUnread(withChatUnread(read, "app/oslo", true, 5), "app/oslo", true, 9);
  assert.deepEqual(again.unreadChats, [{ id: "app/oslo", at: 9 }]);
});

test("Mark as read clears every chat of the workspace (markWorkspaceAsRead)", () => {
  const both = withChatUnread(withChatUnread(ws(), "app/oslo", true, 1), "app/oslo:review:1", true, 2);
  assert.equal(withWorkspaceRead(both).unreadChats, undefined);
  const read = ws();
  assert.equal(withWorkspaceRead(read), read);
});

test("the selected row's click opens the first chat, in tab order, that is unread or waits on the user (fea)", () => {
  const chats = ["app/oslo", "app/oslo:review:1", "app/oslo:review:2"];
  const none = new Map<string, string>();
  const reviewUnread = withChatUnread(ws(), "app/oslo:review:2", true, 1);
  assert.deepEqual(attentionChat(reviewUnread, chats, none), { id: "app/oslo:review:2", unread: true });
  const asking = new Map([["app/oslo:review:1", "needs_user_input"]]);
  assert.deepEqual(attentionChat(reviewUnread, chats, asking), { id: "app/oslo:review:1", unread: false }, "a chat waiting on an answer comes first in tab order");
  assert.equal(attentionChat(ws(), chats, new Map([["app/oslo", "working"]])), undefined, "nothing needs attention");
});
