// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyTranscript, type ChatTranscript } from "./reducer.ts";
import type { Block, ChatMessage } from "./types.ts";
import { earlierConversation, EARLIER_CONVERSATION, lastMessageOfTurn } from "./rewind.ts";

const m = (id: string, role: ChatMessage["role"], turnId: string, blocks: Block[]): ChatMessage => ({ id, sessionId: "c", turnId, role, createdAt: "2026-11-05T10:00:00.000Z", blocks });
const transcript = (messages: ChatMessage[]): ChatTranscript => ({ ...emptyTranscript("c"), messages });

const chat = transcript([
  m("u1", "user", "t1", [{ type: "text", text: "Add a test" }, { type: "text", text: "Attached: notes.md" }]),
  m("a1", "assistant", "t1", [
    { type: "thinking", text: "secret plan" },
    { type: "tool_use", id: "x", name: "Edit", input: {} },
    { type: "tool_result", toolUseId: "x", content: "big output" },
    { type: "tool_use", id: "y", name: "Edit", input: {} },
    { type: "tool_use", id: "z", name: "Bash", input: {} },
    { type: "text", text: "Added it." },
  ]),
  m("s1", "system", "t1", [{ type: "text", text: "notice" }]),
]);

test("the earlier conversation keeps what was said, oldest first, without thinking or tool output", () => {
  const a = earlierConversation(chat)!;
  assert.equal(a.name, EARLIER_CONVERSATION);
  assert.match(a.text, /reset to the end of it/);
  assert.ok(a.text.indexOf("## User\n\nAdd a test\n\nAttached: notes.md") < a.text.indexOf("## Agent\n\nAdded it.\n\n(Used tools: Edit, Bash)"));
  assert.doesNotMatch(a.text, /secret plan|big output|notice/);
});

test("nothing is carried for a chat without a user message", () => {
  assert.equal(earlierConversation(emptyTranscript("c")), null);
  assert.equal(earlierConversation(transcript([m("a", "assistant", "t", [{ type: "text", text: "hi" }])])), null);
});

test("a long conversation keeps its newest messages and says how many were left out", () => {
  const long = transcript(Array.from({ length: 10 }, (_, i) => m(`u${i}`, "user", `t${i}`, [{ type: "text", text: `message ${i} ${"x".repeat(100)}` }])));
  const a = earlierConversation(long, 350)!;
  assert.match(a.text, /\(8 older messages are left out\.\)/);
  assert.match(a.text, /message 9/);
  assert.doesNotMatch(a.text, /message 7/);
});

test("the last message a reset keeps is the turn's last", () => {
  assert.equal(lastMessageOfTurn(chat, "t1"), "s1");
  assert.equal(lastMessageOfTurn(chat, "nope"), null);
});
