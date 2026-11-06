import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCodexPayload, codexChat, failTurn, newestTurn, startTurn, type CodexChatState, type CodexPayload } from "./codex.ts";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { buildRows } from "./view.ts";

type P = CodexPayload extends infer U ? (U extends unknown ? Omit<U, "chatId"> : never) : never;

const now = new Date("2026-11-05T15:00:00.000Z");

function run(prompts: string[], payloads: P[]): { state: CodexChatState; transcript: ChatTranscript; threadId?: string } {
  let state = codexChat("ws");
  let transcript = emptyTranscript("ws");
  let threadId: string | undefined;
  const apply = (events: Parameters<typeof applyChatEvents>[1]) => {
    const r = applyChatEvents(transcript, events);
    assert.ok(r.ok, JSON.stringify(r));
    transcript = r.transcript;
  };
  for (const text of prompts) {
    const s = startTurn(state, text, now);
    state = s.state;
    apply(s.events);
  }
  for (const p of payloads) {
    const s = applyCodexPayload(state, { chatId: "ws", ...p } as CodexPayload, now);
    state = s.state;
    threadId = s.threadId ?? threadId;
    apply(s.events);
  }
  return { state, transcript, threadId };
}

// The order Codex 0.166.0 produced for "create hello.txt, then cat it" on macOS.
const recorded: P[] = [
  { type: "threadStarted", threadId: "th-1", resumed: false },
  { type: "turnStarted", turnId: "u1" },
  { type: "text", itemId: "msg_a", delta: "I’ll create `hello.txt`" },
  { type: "message", itemId: "msg_a", text: "I’ll create `hello.txt`, then run `cat hello.txt`.", phase: "commentary" },
  { type: "approval", requestId: 1, kind: "command", itemId: "exec-1", command: "/bin/zsh -lc 'printf hi > hello.txt'", cwd: "/ws", reason: null, decisions: ["accept", "cancel"] },
  { type: "approvalResolved", requestId: 1 },
  { type: "tool", id: "exec-1", kind: "commandExecution", title: "printf hi > hello.txt", status: "running", input: { command: "printf hi > hello.txt" }, output: null, exitCode: null },
  { type: "tool", id: "exec-1", kind: "commandExecution", title: "printf hi > hello.txt", status: "completed", input: { command: "printf hi > hello.txt" }, output: null, exitCode: 0 },
  { type: "tool", id: "exec-2", kind: "commandExecution", title: "cat hello.txt", status: "completed", input: { command: "cat hello.txt" }, output: "hello from codex\n", exitCode: 0 },
  { type: "thought", itemId: "rs_1", delta: "Done" },
  { type: "thoughtDone", itemId: "rs_1", text: "Done." },
  { type: "text", itemId: "msg_b", delta: "hello from" },
  { type: "text", itemId: "msg_b", delta: " codex" },
  { type: "message", itemId: "msg_b", text: "hello from codex", phase: "final_answer" },
  { type: "turnEnded", outcome: "completed" },
];

test("a recorded turn becomes one assistant message with tools between its texts", () => {
  const { state, transcript, threadId } = run(["make hello.txt"], recorded);
  assert.equal(threadId, "th-1");
  assert.equal(state.open.length, 0);
  assert.deepEqual(state.approvals, []);
  const assistant = transcript.messages.find((m) => m.role === "assistant")!;
  assert.deepEqual(
    assistant.blocks.map((b) => (b.type === "text" || b.type === "thinking" ? `${b.type}:${b.text}` : b.type === "tool_use" ? `use:${b.name}` : `result:${b.content}`)),
    ["text:I’ll create `hello.txt`, then run `cat hello.txt`.", "use:printf hi > hello.txt", "result:", "use:cat hello.txt", "result:hello from codex\n", "thinking:Done.", "text:hello from codex"],
  );
  const rows = buildRows(transcript);
  assert.equal(rows[rows.length - 1]!.kind, "turn_end");
  assert.equal(transcript.turns["ws:t1"]!.status, "completed");
  assert.equal(transcript.activeTurn, null);
});

test("approvals are kept until answered or the turn ends", () => {
  const { state } = run(["x"], recorded.slice(0, 5));
  assert.equal(state.approvals.length, 1);
  assert.deepEqual(state.approvals[0]!.decisions, ["accept", "cancel"]);
  assert.equal("chatId" in state.approvals[0]!, false);
  const ended = run(["x"], [...recorded.slice(0, 5), { type: "turnEnded", outcome: "cancelled" }]);
  assert.deepEqual(ended.state.approvals, []);
  assert.equal(ended.transcript.turns["ws:t1"]!.status, "cancelled");
});

test("declined and failing tools are errors; failures end the turn with Codex's message", () => {
  const { transcript } = run(["x"], [
    { type: "tool", id: "e1", kind: "commandExecution", title: "rm -rf /", status: "declined", input: {}, output: null, exitCode: null },
    { type: "tool", id: "e2", kind: "commandExecution", title: "false", status: "failed", input: {}, output: "", exitCode: 1 },
    { type: "turnEnded", outcome: "failed", message: "unexpected status 401 Unauthorized" },
  ]);
  const blocks = transcript.messages.find((m) => m.role === "assistant")!.blocks;
  assert.deepEqual(
    blocks.filter((b) => b.type === "tool_result").map((b) => b.type === "tool_result" && [b.content, b.isError]),
    [["Declined.", true], ["Exit code 1", true]],
  );
  assert.deepEqual(transcript.turns["ws:t1"], { status: "failed", error: "unexpected status 401 Unauthorized" });
});

test("prompts queue: content goes to the oldest open turn and turnEnded closes it", () => {
  const { transcript, state } = run(["first", "second"], [
    { type: "message", itemId: "m1", text: "one", phase: "final_answer" },
    { type: "turnEnded", outcome: "completed" },
    { type: "message", itemId: "m2", text: "two", phase: "final_answer" },
  ]);
  const replies = transcript.messages.filter((m) => m.role === "assistant").map((m) => [m.turnId, m.blocks[0]]);
  assert.deepEqual(replies, [
    ["ws:t1", { type: "text", text: "one" }],
    ["ws:t2", { type: "text", text: "two" }],
  ]);
  assert.equal(newestTurn(state), "ws:t2");
  assert.equal(transcript.turns["ws:t2"]!.status, "running");
});

test("retry notices replace each other; other notices are separate system rows", () => {
  const { transcript } = run(["x"], [
    { type: "notice", message: "Reconnecting... 1/5", willRetry: true },
    { type: "notice", message: "Reconnecting... 2/5", willRetry: true },
    { type: "notice", message: "Codex asked for item/tool/requestUserInput, which OpenConductor does not support yet; declined.", willRetry: false },
  ]);
  const system = transcript.messages.filter((m) => m.role === "system").map((m) => m.blocks[0]!.type === "text" && m.blocks[0].text);
  assert.deepEqual(system, ["Reconnecting... 2/5", "Codex asked for item/tool/requestUserInput, which OpenConductor does not support yet; declined."]);
});

test("a prompt that never reached Codex fails its own turn only", () => {
  let state = codexChat("ws");
  state = startTurn(state, "x", now).state;
  const s = failTurn(state, "ws:t1", "The Codex CLI was not found.");
  assert.deepEqual(s.events, [{ type: "turn_status", sessionId: "ws", turnId: "ws:t1", status: "failed", error: "The Codex CLI was not found." }]);
  assert.equal(s.state.open.length, 0);
  assert.deepEqual(failTurn(s.state, "ws:t1", "again").events, []);
});
