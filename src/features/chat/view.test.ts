// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import type { Block, ChatEvent, ChatMessage, TurnStatus } from "./types.ts";
import { buildRows, isToolExpanded, type RowView } from "./view.ts";

const msg = (id: string, role: ChatMessage["role"], blocks: Block[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  sessionId: "s1",
  turnId: "t1",
  role,
  createdAt: "2026-11-05T10:00:00.000Z",
  blocks,
  ...extra,
});
const text = (t: string): Block => ({ type: "text", text: t });
const upsert = (message: ChatMessage): ChatEvent => ({ type: "upsert", message });
const status = (turnId: string, s: TurnStatus, error?: string): ChatEvent => ({ type: "turn_status", sessionId: "s1", turnId, status: s, ...(error ? { error } : {}) });
const delta = (messageId: string, blockIndex: number, d: string): ChatEvent => ({ type: "text_delta", sessionId: "s1", messageId, blockIndex, delta: d });

function apply(events: ChatEvent[]): ChatTranscript {
  const r = applyChatEvents(emptyTranscript("s1"), events);
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
  return r.transcript;
}
const kinds = (rows: RowView[]) => rows.map((r) => r.kind);

test("a streaming assistant message marks its last text part as streaming and has no footer yet", () => {
  const rows = buildRows(
    apply([status("t1", "running"), upsert(msg("u1", "user", [text("hi")])), upsert(msg("a1", "assistant", [])), delta("a1", 0, "Hel"), delta("a1", 0, "lo")]),
  );
  assert.deepEqual(kinds(rows), ["user", "assistant"]);
  const a = rows[1]!;
  assert.ok(a.kind === "assistant" && a.streaming);
  assert.deepEqual(a.parts, [{ kind: "text", text: "Hello", streaming: true }]);
});

test("an empty assistant message shows while streaming (typing state) and is dropped once the turn ends", () => {
  const running = buildRows(apply([status("t1", "running"), upsert(msg("a1", "assistant", []))]));
  assert.deepEqual(kinds(running), ["assistant"]);
  const done = buildRows(apply([status("t1", "running"), upsert(msg("a1", "assistant", [])), status("t1", "completed")]));
  assert.deepEqual(kinds(done), ["turn_end"]);
});

test("tool calls pair with their results and tool-result carriers never render as user messages", () => {
  const events = [
    status("t1", "running"),
    upsert(msg("u1", "user", [text("read it")])),
    upsert(msg("a1", "assistant", [text("Reading."), { type: "tool_use", id: "tu1", name: "Read", input: { file_path: "a.rs" } }, { type: "tool_use", id: "tu2", name: "Bash", input: {} }])),
    upsert(msg("r1", "user", [{ type: "tool_result", toolUseId: "tu1", content: "fn main() {}" }])),
  ];
  const rows = buildRows(apply(events));
  assert.deepEqual(kinds(rows), ["user", "assistant"]);
  const a = rows[1]!;
  assert.ok(a.kind === "assistant");
  assert.deepEqual(
    a.parts.map((p) => (p.kind === "tool" ? [p.call.id, p.call.status, p.call.result] : [p.kind])),
    [["text"], ["tu1", "done", "fn main() {}"], ["tu2", "running", undefined]],
  );

  const ended = buildRows(apply([...events, upsert(msg("r2", "user", [{ type: "tool_result", toolUseId: "tu2", content: "boom", isError: true }])), status("t1", "completed")]));
  const b = ended[1]!;
  assert.ok(b.kind === "assistant");
  assert.equal(b.parts[2]!.kind === "tool" && b.parts[2]!.call.status, "error");
});

test("a tool call with no result after its turn ended is interrupted", () => {
  const rows = buildRows(apply([status("t1", "running"), upsert(msg("a1", "assistant", [{ type: "tool_use", id: "tu1", name: "Bash", input: {} }])), status("t1", "cancelled")]));
  const a = rows[0]!;
  assert.ok(a.kind === "assistant" && a.parts[0]!.kind === "tool");
  assert.equal(a.parts[0]!.call.status, "interrupted");
});

test("a mid-turn child-session report renders as a report, not user input, and the turn keeps streaming", () => {
  const rows = buildRows(
    apply([
      status("t1", "running"),
      upsert(msg("u1", "user", [text("go")])),
      upsert(msg("a1", "assistant", [text("Working")])),
      upsert(msg("rep", "user", [text("child done")], { senderSessionId: "child-1" })),
      upsert(msg("k1", "user", [text("from ci")], { senderApiKeyName: "ci", turnId: "t9" })),
      upsert(msg("a2", "assistant", [text("Continuing")])),
    ]),
  );
  assert.deepEqual(kinds(rows), ["user", "assistant", "report", "report", "assistant"]);
  const rep = rows[2]!;
  assert.ok(rep.kind === "report");
  assert.deepEqual(rep.origin, { kind: "session", sessionId: "child-1" });
  assert.deepEqual(rows[3]!.kind === "report" && rows[3]!.origin, { kind: "api_key", name: "ci" });
  assert.ok(rows[1]!.kind === "assistant" && !rows[1]!.streaming);
  assert.ok(rows[4]!.kind === "assistant" && rows[4]!.streaming);
});

test("a finished turn ends with a footer carrying its final text; a failed turn also offers retry with the prompt", () => {
  const ok = buildRows(apply([upsert(msg("u1", "user", [text("q")])), upsert(msg("a1", "assistant", [text("first")])), upsert(msg("a2", "assistant", [text("final")])), status("t1", "completed")]));
  assert.deepEqual(ok[ok.length - 1], { kind: "turn_end", key: "turn-end:t1", turnId: "t1", status: "completed", finalText: "final", canReset: false });

  const failed = buildRows(
    apply([
      upsert(msg("rep", "user", [text("report")], { senderSessionId: "c" })),
      upsert(msg("u1", "user", [text("try this")])),
      upsert(msg("a1", "assistant", [text("partial")])),
      status("t1", "failed", "rate limited"),
    ]),
  );
  assert.deepEqual(failed[failed.length - 1], {
    kind: "turn_end",
    key: "turn-end:t1",
    turnId: "t1",
    status: "failed",
    error: "rate limited",
    finalText: "partial",
    retryPrompt: "try this",
    canReset: false,
  });
});

test("a user toggle on a tool row wins over the expand-by-default setting", () => {
  const toggled = new Map([["tu1", false]]);
  assert.equal(isToolExpanded("tu1", toggled, true), false);
  assert.equal(isToolExpanded("tu2", toggled, true), true);
  assert.equal(isToolExpanded("tu2", toggled, false), false);
});

test("Reset chat applies to every turn with a reply except the chat's last", () => {
  const m = (id: string, turnId: string, role: ChatMessage["role"]) => msg(id, role, [text(id)], { turnId });
  const rows = buildRows(
    apply([
      upsert(m("u1", "t1", "user")),
      upsert(m("a1", "t1", "assistant")),
      status("t1", "completed"),
      upsert(m("u2", "t2", "user")),
      status("t2", "failed", "no agent"),
      upsert(m("u3", "t3", "user")),
      upsert(m("a3", "t3", "assistant")),
      status("t3", "completed"),
    ]),
  );
  const ends = rows.filter((r) => r.kind === "turn_end").map((r) => (r.kind === "turn_end" ? [r.turnId, r.canReset] : null));
  assert.deepEqual(ends, [
    ["t1", true],
    ["t2", false], // no reply to reset to
    ["t3", false], // the last turn
  ]);
});

test("a stopped turn's prompt is marked cancelled (Conductor's \"Cancelled\" caption); others are not", () => {
  const rows = buildRows(
    apply([
      status("t1", "running"),
      upsert(msg("u1", "user", [text("slow")], { cancelledAt: "2026-11-05T10:00:05.000Z" })),
      status("t1", "cancelled"),
      status("t2", "running"),
      upsert(msg("u2", "user", [text("next")], { turnId: "t2" })),
    ]),
  );
  const users = rows.filter((r) => r.kind === "user");
  assert.deepEqual(users.map((r) => r.kind === "user" && r.cancelled), [true, false]);
  const end = rows.find((r) => r.kind === "turn_end");
  assert.equal(end?.kind === "turn_end" && end.status, "cancelled");
});

test("a finished turn's footer carries when the turn started and ended", () => {
  const at = (s: TurnStatus, iso: string): ChatEvent => ({ type: "turn_status", sessionId: "s1", turnId: "t1", status: s, at: iso });
  const rows = buildRows(
    apply([at("running", "2026-11-05T10:29:00.000Z"), upsert(msg("u1", "user", [text("hi")])), upsert(msg("a1", "assistant", [text("done")])), at("completed", "2026-11-05T10:37:00.000Z")]),
  );
  const end = rows.find((r) => r.kind === "turn_end");
  assert.ok(end && end.kind === "turn_end");
  assert.equal(end.startedAt, "2026-11-05T10:29:00.000Z");
  assert.equal(end.endedAt, "2026-11-05T10:37:00.000Z");
});
