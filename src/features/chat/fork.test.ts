// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import type { Block, ChatMessage } from "./types.ts";
import { completeTranscript, copiedTranscriptMessage, forkAttachmentName, forkTranscript, knownModelLabel, turnAgentLabel } from "./fork.ts";

let n = 0;
const msg = (turnId: string, role: ChatMessage["role"], blocks: Block[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`,
  sessionId: "s1",
  turnId,
  role,
  createdAt: "2026-11-05T10:00:00.000Z",
  blocks,
  ...extra,
});
const text = (t: string): Block => ({ type: "text", text: t });
const tool = (name: string): Block => ({ type: "tool_use", id: `tool${++n}`, name, input: { command: "ls" } });
const result = (): Block => ({ type: "tool_result", toolUseId: "x", content: "ok" });

function transcript(messages: ChatMessage[]): ChatTranscript {
  const r = applyChatEvents(
    emptyTranscript("s1"),
    messages.map((message) => ({ type: "upsert", message })),
  );
  assert.ok(r.ok);
  return r.transcript;
}

const chat = transcript([
  msg("t1", "user", [text("Add a footer")]),
  msg("t1", "assistant", [text("Looking at the code.")]),
  msg("t1", "assistant", [tool("Bash")]),
  msg("t1", "user", [result()]),
  msg("t1", "assistant", [text("Done:"), tool("Edit"), tool("Edit"), text("footer added.")]),
  msg("t2", "user", [text("Now test it")]),
  msg("t2", "assistant", [text("Tests pass.")]),
  msg("t3", "user", [text("Ship it")]),
]);

test("fork transcript: turns up to and including the forked one, last reply kept, others elided", () => {
  assert.equal(
    forkTranscript(chat, "t1"),
    ["## User", "Add a footer", "## Assistant", "[2 messages elided]", "Done:", "[2 tool calls elided]", "footer added."].join("\n\n"),
  );
  assert.equal(
    forkTranscript(chat, "t2"),
    forkTranscript(chat, "t1") + "\n\n" + ["## User", "Now test it", "## Assistant", "Tests pass."].join("\n\n"),
  );
});

test("fork transcript: a turn with no reply yet keeps its prompt; no turn id means the whole chat", () => {
  assert.equal(forkTranscript(chat), forkTranscript(chat, "t2") + "\n\n## User\n\nShip it");
});

test("fork transcript: replies after the last one with text are elided after it", () => {
  const t = transcript([msg("t1", "user", [text("go")]), msg("t1", "assistant", [text("ok")]), msg("t1", "assistant", [tool("Read")])]);
  assert.equal(forkTranscript(t, "t1"), "## User\n\ngo\n\n## Assistant\n\nok\n\n[1 message elided]");
});

test("fork transcript: cancelled prompts, reports and unknown turns", () => {
  const t = transcript([
    msg("t1", "user", [text("stopped")], { cancelledAt: "2026-11-05T10:01:00.000Z" }),
    msg("t1", "assistant", [text("partial")]),
    msg("t2", "user", [text("report")], { senderSessionId: "child" }),
  ]);
  assert.equal(forkTranscript(t, "t1"), null);
  assert.equal(forkTranscript(t, "t2"), null);
  assert.equal(forkTranscript(chat, "missing"), null);
  assert.equal(forkTranscript(emptyTranscript("s1")), null);
});

test("fork attachment name", () => {
  assert.equal(forkAttachmentName("Footer work"), "Transcript of Footer work.md");
  assert.equal(forkAttachmentName("  "), "Transcript of chat.md");
  assert.equal(forkAttachmentName(null), "Transcript of chat.md");
});

test("footer hover agent line: model via agent when the model is known, else the agent", () => {
  assert.equal(turnAgentLabel("byok:anthropic:claude-opus-5-5", "Reason"), "Opus 5.5 via Reason");
  assert.equal(turnAgentLabel("byok:openai-codex:gpt-5.6-sol", "Reason"), "GPT-5.6 Sol via Reason");
  // Conductor's label table (`lv`) names opus-5-5-1m "Opus 5.5".
  assert.equal(turnAgentLabel("opus-5-5-1m", "Reason"), "Opus 5.5 via Reason");
  assert.equal(turnAgentLabel("some-provider:mystery", "Reason"), "Reason");
  assert.equal(turnAgentLabel(null, "Codex"), "Codex");
  assert.equal(knownModelLabel("byok:anthropic:claude-sonnet-4-6"), "Sonnet 4.6");
});

test("the copy toast names the chat, cut to 20 characters (Conductor's chat tab `L`)", async () => {
  const { copiedTranscriptMessage } = await import("./fork.ts");
  assert.equal(copiedTranscriptMessage("concise", "amber-falcon"), 'Copied concise transcript of "amber-falcon"');
  assert.equal(copiedTranscriptMessage("concise", "  "), 'Copied concise transcript of "chat"');
  assert.equal(copiedTranscriptMessage("concise", "Fix the flaky login test today"), 'Copied concise transcript of "Fix the flaky login..."');
});

test("complete transcript: every message, tool calls with their results, prompts as User", () => {
  const t = transcript([
    msg("c1", "user", [text("Add a footer")]),
    msg("c1", "assistant", [text("Looking."), { type: "tool_use", id: "u1", name: "Bash", input: { command: "ls src" } }]),
    msg("c1", "user", [{ type: "tool_result", toolUseId: "u1", content: "a.ts\nb.ts" }]),
    msg("c1", "assistant", [{ type: "tool_use", id: "u2", name: "Edit", input: {} }, text("Done.")]),
    msg("c2", "user", [text("Thanks")]),
  ]);
  assert.equal(
    completeTranscript(t),
    ["## User", "Add a footer", "## Assistant", "Looking.", "    Bash: ls src\n    ↳ a.ts\n      b.ts", "    Edit", "Done.", "## User", "Thanks"].join("\n\n"),
  );
});

test("complete transcript: long input becomes an indented block, long results are cut, cancelled turns drop", () => {
  const long = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
  const t = transcript([
    msg("c1", "user", [text("go")]),
    msg("c1", "assistant", [{ type: "tool_use", id: "u1", name: "Write", input: { content: "x".repeat(90) } }, { type: "tool_result", toolUseId: "u1", content: long }]),
    msg("c2", "user", [text("never mind")], { cancelledAt: "2026-11-05T10:00:01.000Z" }),
  ]);
  const json = JSON.stringify({ content: "x".repeat(90) });
  const kept = Array.from({ length: 10 }, (_, i) => `line ${i}`);
  assert.equal(
    completeTranscript(t),
    ["## User", "go", "## Assistant", `    Write:\n        ${json}\n    ↳ ${kept[0]}\n${kept.slice(1).map((l) => `      ${l}`).join("\n")}\n      …\n      (2 more lines)`].join("\n\n"),
  );
  assert.equal(completeTranscript(transcript([])), null);
});

test("transcript toasts: concise and complete name the chat, cut to 20 characters", () => {
  assert.equal(copiedTranscriptMessage("complete", "A very long chat title here"), 'Copied complete transcript of "A very long chat tit..."');
  assert.equal(copiedTranscriptMessage("concise", ""), 'Copied concise transcript of "chat"');
});
