// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyState, lastUserMessageAt, type OtherChat } from "./chatEmptyState.ts";
import type { ChatMessage } from "./types.ts";

const chat = (chatId: string, at: number | null): OtherChat => ({ chatId, title: `Chat ${chatId}`, agent: "reason", lastUserMessageAt: at });
const msg = (role: ChatMessage["role"], text: string, createdAt = "2026-11-05T10:00:00.000Z", extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `${role}-${text}`,
  sessionId: "s",
  turnId: "t",
  role,
  createdAt,
  blocks: [{ type: "text", text }],
  ...extra,
});

test("the workspace's first chat shows the intro with its steps", () => {
  assert.deepEqual(emptyState([], "ready"), { kind: "first", steps: true });
  assert.deepEqual(emptyState([], undefined), { kind: "first", steps: true });
  assert.deepEqual(emptyState([chat("a", null)], "setting_up"), { kind: "first", steps: true });
  assert.deepEqual(emptyState([], "deleting"), { kind: "first", steps: false });
});

test("an archived or unstarted workspace shows nothing", () => {
  assert.deepEqual(emptyState([], "archived"), { kind: "none" });
  assert.deepEqual(emptyState([], "unstarted"), { kind: "none" });
});

test("a later chat lists the other chats with messages, newest first", () => {
  const s = emptyState([chat("a", 1), chat("b", null), chat("c", 3)], "ready");
  assert.equal(s.kind, "more");
  assert.deepEqual(s.kind === "more" && s.transcripts.map((c) => c.chatId), ["c", "a"]);
  assert.deepEqual(s.kind === "more" && s.overflow, []);
});

test("past five chats, four show and the rest go behind +N more", () => {
  const s = emptyState([1, 2, 3, 4, 5, 6].map((n) => chat(String(n), n)), "ready");
  assert.ok(s.kind === "more");
  assert.deepEqual(s.transcripts.map((c) => c.chatId), ["6", "5", "4", "3"]);
  assert.deepEqual(s.overflow.map((c) => c.chatId), ["2", "1"]);
  const five = emptyState([1, 2, 3, 4, 5].map((n) => chat(String(n), n)), "ready");
  assert.ok(five.kind === "more" && five.transcripts.length === 5 && five.overflow.length === 0);
});

test("only the user's own messages count", () => {
  assert.equal(lastUserMessageAt([msg("assistant", "hi")]), null);
  assert.equal(lastUserMessageAt([msg("user", "from a child", undefined, { senderSessionId: "x" })]), null);
  assert.equal(lastUserMessageAt([msg("user", "a", "2026-11-05T10:00:00.000Z"), msg("assistant", "b", "2026-11-05T11:00:00.000Z")]), Date.parse("2026-11-05T10:00:00.000Z"));
});
