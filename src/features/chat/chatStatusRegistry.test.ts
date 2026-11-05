import { test } from "node:test";
import assert from "node:assert/strict";
import { chatStatuses, hideChatStatus, reportChatStatus, subscribeChatStatuses } from "./chatStatusRegistry.ts";
import { codexSessionStatus } from "./codexChat.ts";
import { emptyTranscript } from "./reducer.ts";
import { emptyQueue } from "./queue.ts";
import type { CodexApproval } from "./codex.ts";

test("each agent reports its chats; a chat id both agents have shows the more urgent status", () => {
  let calls = 0;
  const off = subscribeChatStatuses(() => calls++);
  reportChatStatus("w1", "reason", "idle");
  reportChatStatus("w1", "codex", "needs_user_permission");
  assert.equal(chatStatuses().get("w1"), "needs_user_permission");
  reportChatStatus("w1", "codex", "working");
  assert.equal(chatStatuses().get("w1"), "working");
  const before = calls;
  reportChatStatus("w1", "codex", "working");
  assert.equal(calls, before, "an unchanged report does not notify");
  reportChatStatus("w1", "codex", undefined);
  assert.equal(chatStatuses().get("w1"), "idle");
  reportChatStatus("w1", "reason", undefined);
  assert.ok(!chatStatuses().has("w1"));
  off();
});

test("a hidden chat drops out, whatever its agents report next", () => {
  reportChatStatus("w2:review:1", "reason", "working");
  const map = chatStatuses();
  hideChatStatus("w2:review:1");
  assert.ok(!chatStatuses().has("w2:review:1"));
  assert.notEqual(chatStatuses(), map, "a change gives a new map");
  reportChatStatus("w2:review:1", "reason", "cancelling");
  assert.ok(!chatStatuses().has("w2:review:1"));
});

test("a Codex chat needs permission while an approval waits, else follows its turn and queue", () => {
  const view = (over: Partial<Parameters<typeof codexSessionStatus>[0]> = {}) => ({ transcript: emptyTranscript("c"), queue: emptyQueue(), approvals: [], ...over });
  const approval = { requestId: 1, kind: "command", decisions: ["accept", "decline"] } as unknown as CodexApproval;
  assert.equal(codexSessionStatus(view()), "idle");
  assert.equal(codexSessionStatus(view({ queue: { ...emptyQueue(), status: "working" } })), "working");
  assert.equal(codexSessionStatus(view({ queue: { ...emptyQueue(), status: "cancelling" } })), "cancelling");
  assert.equal(codexSessionStatus(view({ queue: { ...emptyQueue(), status: "working" }, approvals: [approval] })), "needs_user_permission");
});
