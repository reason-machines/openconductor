// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { chatAgentStatuses, chatStatuses, hideChat, publishChatStatus, subscribeChatStatuses } from "./chatStatus.ts";

test("a chat shows the most urgent status of its agents; a hidden chat drops out", () => {
  let changes = 0;
  const off = subscribeChatStatuses(() => changes++);
  publishChatStatus("ws-1", "reason", "idle");
  assert.equal(chatStatuses().get("ws-1"), "idle");
  publishChatStatus("ws-1", "codex", "needs_user_permission");
  assert.equal(chatStatuses().get("ws-1"), "needs_user_permission");
  assert.deepEqual([...chatAgentStatuses("ws-1")], [["reason", "idle"], ["codex", "needs_user_permission"]]);
  const before = chatStatuses();
  publishChatStatus("ws-1", "codex", "needs_user_permission");
  assert.equal(chatStatuses(), before, "no change, same map");
  publishChatStatus("ws-1", "codex", "idle");
  assert.equal(chatStatuses().get("ws-1"), "idle");
  hideChat("ws-1");
  assert.equal(chatStatuses().has("ws-1"), false);
  assert.equal(changes, 4);
  off();
});
