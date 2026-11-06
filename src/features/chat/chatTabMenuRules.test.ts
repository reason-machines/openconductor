import { test } from "node:test";
import assert from "node:assert/strict";
import { showCloseSection, splitEnterHint } from "./chatTabMenuRules.ts";

test("Close section: several chats, or a chat with a user message, in a writable workspace", () => {
  assert.equal(showCloseSection({ writable: true, chatCount: 2, hasUserMessage: false }), true);
  assert.equal(showCloseSection({ writable: true, chatCount: 1, hasUserMessage: true }), true);
  assert.equal(showCloseSection({ writable: true, chatCount: 1, hasUserMessage: false }), false);
  assert.equal(showCloseSection({ writable: false, chatCount: 3, hasUserMessage: true }), false);
});

test("an Enter hint splits off the ↵ for the glyph", () => {
  assert.deepEqual(splitEnterHint("⌘⌥↵"), { prefix: "⌘⌥", enter: true });
  assert.deepEqual(splitEnterHint("⌘⌥C"), { prefix: "⌘⌥C", enter: false });
});
