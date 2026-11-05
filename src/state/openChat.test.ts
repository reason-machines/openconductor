import { test } from "node:test";
import assert from "node:assert/strict";
import { chatOpenable, onChatRequest, requestChat, setOpenReviewChats, takeChatRequest, workspaceChats } from "./openChat.ts";

test("a workspace's chats are its main chat and its open review tabs, in tab order", () => {
  assert.deepEqual(workspaceChats("app/oslo"), ["app/oslo"]);
  setOpenReviewChats("app/oslo", ["app/oslo:review:1", "app/oslo:review:2"]);
  assert.deepEqual(workspaceChats("app/oslo"), ["app/oslo", "app/oslo:review:1", "app/oslo:review:2"]);
  assert.equal(chatOpenable("app/oslo"), true, "the main chat always has a tab");
  assert.equal(chatOpenable("app/oslo:review:2"), true);
  assert.equal(chatOpenable("app/oslo:review:9"), false, "a closed (or pre-restart) review has no tab");
  setOpenReviewChats("app/oslo", ["app/oslo:review:1"]);
  assert.equal(chatOpenable("app/oslo:review:2"), false);
  setOpenReviewChats("app/oslo", []);
  assert.deepEqual(workspaceChats("app/oslo"), ["app/oslo"]);
});

test("a request to show a chat reaches its workspace once", () => {
  const heard: string[] = [];
  const off = onChatRequest((ws) => heard.push(ws));
  requestChat("app/oslo:review:1");
  off();
  requestChat("app/lima");
  assert.deepEqual(heard, ["app/oslo"]);
  assert.equal(takeChatRequest("app/oslo"), "app/oslo:review:1");
  assert.equal(takeChatRequest("app/oslo"), undefined, "taken once");
  assert.equal(takeChatRequest("app/lima"), "app/lima", "kept until that workspace opens");
});
