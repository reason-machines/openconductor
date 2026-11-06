import { test } from "node:test";
import assert from "node:assert/strict";
import { chatOpenable, chatTabWrites, onChatRequest, requestChat, restoreChatTabs, restoredChatTabs, setOpenReviewChats, takeChatRequest, workspaceChats } from "./openChat.ts";

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

test("tabs open when the app last ran come back until this window changes the strip", () => {
  restoreChatTabs("app/kyiv", [
    { id: "app/kyiv:review:1", title: "Review" },
    { id: "app/kyiv:chat:2", title: "Untitled" },
  ]);
  assert.deepEqual(workspaceChats("app/kyiv"), ["app/kyiv", "app/kyiv:review:1", "app/kyiv:chat:2"]);
  assert.equal(chatOpenable("app/kyiv:review:1"), true, "a restored review has a tab");
  assert.equal(restoredChatTabs("app/kyiv").length, 2);
  // The user closes one: the window owns the strip, and a later database read does not undo it.
  setOpenReviewChats("app/kyiv", ["app/kyiv:chat:2"]);
  restoreChatTabs("app/kyiv", [{ id: "app/kyiv:review:1", title: "Review" }]);
  assert.equal(chatOpenable("app/kyiv:review:1"), false);
  assert.deepEqual(restoredChatTabs("app/kyiv"), []);
  // A workspace with no stored tab has only its main chat.
  restoreChatTabs("app/lima", []);
  assert.deepEqual(workspaceChats("app/lima"), ["app/lima"]);
});

test("a strip change writes the tabs that opened and closed", () => {
  const review = { chatId: "app/oslo:review:1", title: "Review" };
  const blank = { chatId: "app/oslo:chat:2", title: "Untitled" };
  assert.deepEqual(chatTabWrites("app/oslo", [], [review]), [{ command: "db_open_chat_tab", args: { chatId: "app/oslo:review:1", workspaceId: "app/oslo", title: "Review" } }]);
  assert.deepEqual(chatTabWrites("app/oslo", [review, blank], [blank]), [{ command: "db_close_chat_tab", args: { chatId: "app/oslo:review:1" } }]);
  assert.deepEqual(chatTabWrites("app/oslo", [review, blank], [blank, review]), [], "reordering writes nothing");
});
