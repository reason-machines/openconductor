import { test } from "node:test";
import assert from "node:assert/strict";
import { atTabLimit, CHAT_TAB_LIMIT, NEW_CHAT_TITLE, newChatId, newChatTooltip, tabLimitToast, tabLimitTooltip } from "./chatTabs.ts";
import { workspaceOfChat } from "../../state/workspaceSessions.ts";

test("the + tooltip is Conductor's 'New chat, same files' with the shortcut", () => {
  assert.equal(newChatTooltip(1, "⌘T"), "New chat, same files ⌘T");
  assert.equal(newChatTooltip(4, "⌘T"), "New chat, same files ⌘T");
  // An unbound shortcut leaves the label alone.
  assert.equal(newChatTooltip(1, null), "New chat, same files");
});

test("five tabs is the limit: the button names it and ⌘T warns", () => {
  assert.equal(CHAT_TAB_LIMIT, 5);
  assert.equal(atTabLimit(4), false);
  assert.equal(atTabLimit(5), true);
  assert.equal(atTabLimit(6), true);
  assert.equal(newChatTooltip(5, "⌘T"), "Maximum 5 tabs allowed");
  assert.equal(tabLimitTooltip(), "Maximum 5 tabs allowed");
  assert.equal(tabLimitToast(), "Maximum of 5 tabs allowed");
  assert.equal(tabLimitToast(10), "Maximum of 10 tabs allowed");
});

test("a new chat is Untitled and belongs to its workspace", () => {
  assert.equal(NEW_CHAT_TITLE, "Untitled");
  const id = newChatId("ws-1", 1_700_000_000_000, 3);
  assert.match(id, /^ws-1:chat:[0-9a-z]+-3$/);
  assert.notEqual(id, newChatId("ws-1", 1_700_000_000_000, 4));
  assert.equal(workspaceOfChat(id), "ws-1");
});
