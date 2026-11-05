// Run: node --test "src/**/*.test.ts"  (Node 22.18+ strips types natively)
// Mirrors the transcript cases in src-tauri/src/chat/tests.rs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatEvent, applyChatEvents, emptyTranscript, transcriptFromMessages, type ChatTranscript } from "./reducer.ts";
import { messageOrigin, plainText, type Block, type ChatEvent, type ChatMessage, type TurnStatus } from "./types.ts";

const msg = (id: string, role: ChatMessage["role"], blocks: Block[]): ChatMessage => ({
  id,
  sessionId: "s1",
  turnId: "t1",
  role,
  createdAt: "2026-11-05T10:00:00.000Z",
  blocks,
});
const upsert = (message: ChatMessage): ChatEvent => ({ type: "upsert", message });
const delta = (messageId: string, blockIndex: number, text: string): ChatEvent => ({ type: "text_delta", sessionId: "s1", messageId, blockIndex, delta: text });
const status = (turnId: string, s: TurnStatus, error?: string): ChatEvent => ({ type: "turn_status", sessionId: "s1", turnId, status: s, ...(error ? { error } : {}) });

function apply(events: ChatEvent[], start: ChatTranscript = emptyTranscript("s1")): ChatTranscript {
  const r = applyChatEvents(start, events);
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
  return r.transcript;
}

test("wire JSON from the backend parses into the mirror types", () => {
  // Same JSON that message_serializes_camel_case_and_omits_absent_optionals pins in Rust.
  const wire = `{"id":"m1","sessionId":"s1","turnId":"t1","role":"assistant","createdAt":"2026-11-05T10:00:00.000Z",
    "blocks":[{"type":"text","text":"hi"},{"type":"thinking","text":"hmm"},
    {"type":"tool_use","id":"tu1","name":"Read","input":{"file_path":"a.rs"}},
    {"type":"tool_result","toolUseId":"tu1","content":"fn main() {}","isError":false}]}`;
  const m = JSON.parse(wire) as ChatMessage;
  const t = apply([upsert(m)]);
  assert.equal(t.messages[0]!.blocks[3]!.type, "tool_result");
  assert.equal(plainText(m), "hi");
});

test("plainText joins text blocks only", () => {
  const m = msg("m1", "assistant", [{ type: "text", text: "a" }, { type: "thinking", text: "x" }, { type: "text", text: "" }, { type: "text", text: "b" }]);
  assert.equal(plainText(m), "a\n\nb");
});

test("upsert appends, then replaces in place", () => {
  let t = apply([upsert(msg("m1", "user", [])), upsert(msg("m2", "assistant", []))]);
  t = apply([upsert(msg("m1", "user", [{ type: "text", text: "edited" }]))], t);
  assert.deepEqual(t.messages.map((m) => m.id), ["m1", "m2"]);
  assert.deepEqual(t.messages[0]!.blocks, [{ type: "text", text: "edited" }]);
});

test("text_delta starts and grows text blocks without mutating the previous transcript", () => {
  const before = apply([upsert(msg("m1", "assistant", []))]);
  const after = apply([delta("m1", 0, "Hel"), delta("m1", 0, "lo"), delta("m1", 1, "!")], before);
  assert.deepEqual(after.messages[0]!.blocks, [{ type: "text", text: "Hello" }, { type: "text", text: "!" }]);
  assert.deepEqual(before.messages[0]!.blocks, []);
});

test("text_delta grows thinking blocks", () => {
  const t = apply([upsert(msg("m1", "assistant", [{ type: "thinking", text: "a" }])), delta("m1", 0, "b")]);
  assert.deepEqual(t.messages[0]!.blocks, [{ type: "thinking", text: "ab" }]);
});

test("bad deltas are rejected without changes", () => {
  const t = apply([upsert(msg("m1", "assistant", [{ type: "tool_use", id: "tu", name: "Bash", input: {} }]))]);
  const cases: Array<[ChatEvent, string]> = [
    [delta("nope", 0, "x"), "unknown_message"],
    [delta("m1", 5, "x"), "block_index_out_of_range"],
    [delta("m1", 0, "x"), "not_a_text_block"],
  ];
  for (const [event, kind] of cases) {
    const r = applyChatEvent(t, event);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.kind, kind);
  }
  assert.deepEqual(t.messages[0]!.blocks, [{ type: "tool_use", id: "tu", name: "Bash", input: {} }]);
});

test("events for another session are rejected", () => {
  const r = applyChatEvent(emptyTranscript("s1"), { type: "turn_status", sessionId: "s2", turnId: "t", status: "running" });
  assert.deepEqual(r, { ok: false, error: { kind: "wrong_session", expected: "s1", got: "s2" } });
});

test("turn_status tracks the active turn and keeps the error", () => {
  let t = apply([status("t1", "running")]);
  assert.equal(t.activeTurn, "t1");
  t = apply([status("t2", "running"), status("t1", "completed")], t);
  assert.equal(t.activeTurn, "t2", "finishing an older turn leaves the newer one active");
  t = apply([status("t2", "failed", "boom")], t);
  assert.equal(t.activeTurn, null);
  assert.deepEqual(t.turns.t2, { status: "failed", error: "boom" });
  assert.deepEqual(t.turns.t1, { status: "completed" });
});

test("transcriptFromMessages keeps this session's messages and lets later copies win", () => {
  const other = { ...msg("x", "user", []), sessionId: "s2" };
  const t = transcriptFromMessages("s1", [msg("m1", "user", []), other, msg("m1", "user", [{ type: "text", text: "v2" }])]);
  assert.deepEqual(t.messages.map((m) => m.id), ["m1"]);
  assert.equal(plainText(t.messages[0]!), "v2");
});

test("sender fields parse from the wire and decide the origin", () => {
  // Same keys sender_fields_use_camel_case_and_are_omitted_when_absent pins in Rust.
  const wire = `{"id":"m2","sessionId":"s1","turnId":"t1","role":"user","createdAt":"2026-11-05T10:00:00.000Z",
    "senderSessionId":"child-1","senderApiKeyName":"ci","blocks":[{"type":"text","text":"done"}]}`;
  const m = JSON.parse(wire) as ChatMessage;
  assert.deepEqual(messageOrigin(m), { kind: "session", sessionId: "child-1" });
  assert.deepEqual(messageOrigin({ ...m, senderSessionId: undefined }), { kind: "api_key", name: "ci" });
  assert.deepEqual(messageOrigin(msg("u", "user", [])), { kind: "user" });
  assert.deepEqual(messageOrigin(msg("a", "assistant", [])), { kind: "assistant" });
  assert.deepEqual(messageOrigin(msg("s", "system", [])), { kind: "system" });
});

test("a session report arriving mid-turn leaves the active turn running", () => {
  const report = { ...msg("r1", "user", [{ type: "text", text: "child finished" }]), senderSessionId: "child-1" };
  const t = apply([status("t1", "running"), upsert(report)]);
  assert.equal(t.activeTurn, "t1");
  assert.deepEqual(t.turns["t1"], { status: "running" });
  assert.deepEqual(messageOrigin(t.messages[0]!), { kind: "session", sessionId: "child-1" });
});
