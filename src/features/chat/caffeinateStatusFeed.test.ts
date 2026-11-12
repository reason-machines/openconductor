import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { onChatAttention } from "./attention.ts";
import { chatStatuses, connectStatusStore, hideChat, reportChatStatus, showChat, subscribeChatStatuses } from "./chatRuntime.ts";

const calls: { command: string; args: Record<string, unknown> }[] = [];
connectStatusStore({
  async invoke(command, args) {
    calls.push({ command, args });
    assert.ok(command === "session_statuses" || command === "session_set_status", `Unexpected status boundary ${command}`);
    return command === "session_statuses" ? [] : undefined;
  },
  async listen() {},
});

const writesFor = (chatId: string) => calls.filter((call) => call.command === "session_set_status" && call.args.chatId === chatId).map((call) => call.args);
const settled = async () => { await setImmediate(); };

test("visible status publication keeps ordering, duplicate suppression and presentation", async () => {
  await settled();
  const id = "caffeinate-feed-visible:review:1";
  reportChatStatus(id, "working");
  reportChatStatus(id, "working");
  reportChatStatus(id, "waiting");
  await settled();
  assert.deepEqual(writesFor(id), [
    { chatId: id, workspaceId: "caffeinate-feed-visible", status: "working" },
    { chatId: id, workspaceId: "caffeinate-feed-visible", status: "waiting" },
  ]);
  assert.equal(chatStatuses().get(id), "waiting");
});

test("hidden status transitions still publish their canonical ordered native feed", async () => {
  const id = "caffeinate-feed-hidden:review:2";
  hideChat(id);
  reportChatStatus(id, "working");
  reportChatStatus(id, "working");
  reportChatStatus(id, "waiting");
  reportChatStatus(id, "idle");
  await settled();
  assert.deepEqual(writesFor(id), [
    { chatId: id, workspaceId: "caffeinate-feed-hidden", status: "working" },
    { chatId: id, workspaceId: "caffeinate-feed-hidden", status: "waiting" },
    { chatId: id, workspaceId: "caffeinate-feed-hidden", status: "idle" },
  ], "Hidden working, waiting and settlement must reach the existing native status boundary");
});

test("hidden status publication does not restore presentation rows or request attention", async () => {
  const id = "caffeinate-feed-hidden-attention";
  const attention: string[] = [];
  const offAttention = onChatAttention((chatId) => attention.push(chatId));
  let presentationChanges = 0;
  const offStatuses = subscribeChatStatuses(() => presentationChanges++);
  try {
    hideChat(id);
    reportChatStatus(id, "working");
    reportChatStatus(id, "needs_plan_response");
    reportChatStatus(id, "needs_user_input");
    await settled();
    assert.equal(chatStatuses().has(id), false);
    assert.equal(presentationChanges, 0);
    assert.deepEqual(attention, []);
  } finally {
    offAttention();
    offStatuses();
  }
});

test("closing a visible chat does not prevent later canonical settlement publication", async () => {
  const id = "caffeinate-feed-close";
  reportChatStatus(id, "working");
  await settled();
  hideChat(id);
  reportChatStatus(id, "waiting");
  reportChatStatus(id, "idle");
  await settled();
  assert.equal(chatStatuses().has(id), false);
  assert.deepEqual(writesFor(id).map((write) => write.status), ["working", "waiting", "idle"], "Closing is visibility, not loss of the agent's later state transitions");
  showChat(id);
  reportChatStatus(id, "working");
  await settled();
  assert.equal(chatStatuses().get(id), "working");
});
