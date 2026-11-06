import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CLOSED_TAB_LIMIT, chatAfterClose, popClosedTab, pushClosedTab, recordViewedChat, resetClosedTabs, type ClosedTab } from "./closedTabs.ts";

const chat = (chatId: string): ClosedTab => ({ kind: "chat", tab: { chatId, title: "Untitled", blank: true, modelLabel: "", effort: null } });

beforeEach(resetClosedTabs);

test("closed tabs come back newest first, per workspace", () => {
  pushClosedTab("w1", chat("a"));
  pushClosedTab("w1", { kind: "diff" });
  pushClosedTab("w2", chat("b"));
  assert.deepEqual(popClosedTab("w1"), { kind: "diff" });
  assert.deepEqual(popClosedTab("w1"), chat("a"));
  assert.equal(popClosedTab("w1"), undefined);
  assert.deepEqual(popClosedTab("w2"), chat("b"));
});

test("only the last 10 closed tabs are kept", () => {
  for (let i = 0; i < CLOSED_TAB_LIMIT + 3; i++) pushClosedTab("w", chat(`c${i}`));
  const back: string[] = [];
  for (let t = popClosedTab("w"); t; t = popClosedTab("w")) if (t.kind === "chat") back.push(t.tab.chatId);
  assert.equal(back.length, CLOSED_TAB_LIMIT);
  assert.equal(back[0], `c${CLOSED_TAB_LIMIT + 2}`);
  assert.equal(back.at(-1), "c3");
});

test("closing the chat on screen shows the chat viewed before it that is still open", () => {
  recordViewedChat("w", "chat");
  recordViewedChat("w", "r1");
  recordViewedChat("w", "r2");
  recordViewedChat("w", "r3");
  assert.equal(chatAfterClose("w", "r3", ["chat", "r1", "r2", "r3"]), "r2");
  // r2 was closed earlier: the next one viewed before it.
  assert.equal(chatAfterClose("w", "r3", ["chat", "r1", "r3"]), "r1");
});

test("with no view history the last open chat is shown", () => {
  assert.equal(chatAfterClose("w", "r2", ["chat", "r1", "r2"]), "r1");
  assert.equal(chatAfterClose("w", "r1", ["chat", "r1"]), "chat");
});
