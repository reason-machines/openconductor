// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import type { Block, ChatEvent, ChatMessage } from "./types.ts";
import { ChatSaver, diffForSave, restoreEvents, type SaveBatch } from "./persist.ts";

const C = "w1";
const msg = (id: string, role: ChatMessage["role"], turnId: string, blocks: Block[], extra: Partial<ChatMessage> = {}): ChatEvent => ({
  type: "upsert",
  message: { id, sessionId: C, turnId, role, createdAt: `2026-11-05T10:00:0${id.length}.000Z`, blocks, ...extra },
});
const text = (t: string): Block => ({ type: "text", text: t });
const status = (turnId: string, s: "running" | "completed" | "cancelled" | "failed", at: string, error?: string): ChatEvent => ({
  type: "turn_status",
  sessionId: C,
  turnId,
  status: s,
  at,
  ...(error ? { error } : {}),
});
const delta = (messageId: string, d: string): ChatEvent => ({ type: "text_delta", sessionId: C, messageId, blockIndex: 0, delta: d });

function apply(t: ChatTranscript, events: ChatEvent[]): ChatTranscript {
  const r = applyChatEvents(t, events);
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.error));
  return r.transcript;
}
const restore = (rows: string[]) => apply(emptyTranscript(C), restoreEvents(C, rows));

/** Rows as the database holds them after a series of batches (upsert keeps first-write order). */
function store(batches: SaveBatch[]): string[] {
  const rows = new Map<string, string>();
  for (const b of batches) {
    for (const u of b.upserts) rows.set(u.id, u.fullMessage);
    for (const id of b.deleteIds) rows.delete(id);
  }
  return [...rows.values()];
}

const t1 = apply(emptyTranscript(C), [
  status("t1", "running", "2026-11-05T10:00:00.000Z"),
  msg("u1", "user", "t1", [text("fix it")]),
  msg("a1", "assistant", "t1", [text("")]),
  delta("a1", "Fixed."),
  status("t1", "completed", "2026-11-05T10:08:00.000Z"),
]);

test("a saved chat restores to the same messages and turn state", () => {
  const rows = store([diffForSave(null, t1)]);
  const back = restore(rows);
  assert.deepEqual(back.messages, t1.messages);
  assert.deepEqual(back.turns, t1.turns);
  assert.equal(back.activeTurn, null);
});

test("only changed messages are written; a turn's state rides on its first message", () => {
  const streaming = apply(emptyTranscript(C), [status("t1", "running", "2026-11-05T10:00:00.000Z"), msg("u1", "user", "t1", [text("fix it")]), msg("a1", "assistant", "t1", [text("Fi")])]);
  const more = apply(streaming, [delta("a1", "xed.")]);
  assert.deepEqual(diffForSave(streaming, more).upserts.map((u) => u.id), ["a1"]);
  const done = apply(more, [status("t1", "completed", "2026-11-05T10:08:00.000Z")]);
  const batch = diffForSave(more, done);
  assert.deepEqual(batch.upserts.map((u) => u.id), ["u1"]);
  assert.equal(JSON.parse(batch.upserts[0]!.fullMessage).turn.status, "completed");
  assert.deepEqual(diffForSave(done, done), { upserts: [], deleteIds: [] });
});

test("rows carry the columns Conductor filters on", () => {
  const stopped = apply(emptyTranscript(C), [status("t1", "running", "x"), msg("u1", "user", "t1", [text("slow")], { cancelledAt: "2026-11-05T10:00:05.000Z" }), status("t1", "cancelled", "y")]);
  const [row] = diffForSave(null, stopped).upserts;
  assert.equal(row!.content, "slow");
  assert.equal(row!.turnId, "t1");
  assert.equal(row!.cancelledAt, "2026-11-05T10:00:05.000Z");
  assert.equal(row!.sentAt, row!.createdAt);
  assert.equal(restore([row!.fullMessage]).turns.t1?.status, "cancelled");
});

test("Reset chat deletes the dropped turns' rows", () => {
  const two = apply(t1, [status("t2", "running", "z"), msg("u2", "user", "t2", [text("more")]), msg("a2", "assistant", "t2", [text("ok")]), status("t2", "completed", "z2")]);
  const reset = truncateAfterTurn(two, "t1");
  const batch = diffForSave(two, reset);
  assert.deepEqual(batch.deleteIds.sort(), ["a2", "u2"]);
  assert.deepEqual(restore(store([diffForSave(null, two), batch])).messages, t1.messages);
});

test("a failed turn keeps its error; a turn running at quit comes back cancelled", () => {
  const failed = apply(emptyTranscript(C), [status("t1", "running", "a"), msg("u1", "user", "t1", [text("go")]), status("t1", "failed", "b", "no CLI")]);
  assert.deepEqual(restore(store([diffForSave(null, failed)])).turns.t1, { status: "failed", error: "no CLI", startedAt: "a", endedAt: "b" });
  const running = apply(emptyTranscript(C), [status("t1", "running", "a"), msg("u1", "user", "t1", [text("go")])]);
  const back = restore(store([diffForSave(null, running)]));
  assert.equal(back.turns.t1?.status, "cancelled");
  assert.equal(back.activeTurn, null);
});

test("unreadable rows are skipped and messages take the chat's id", () => {
  const rows = store([diffForSave(null, t1)]);
  const back = apply(emptyTranscript("w2"), restoreEvents("w2", ["not json", "{}", ...rows]));
  assert.equal(back.messages.length, 2);
  assert.ok(back.messages.every((m) => m.sessionId === "w2"));
});

test("the saver batches changes, writes one at a time, and retries a failed write on the next change", async () => {
  const writes: SaveBatch[] = [];
  let fail = true;
  const saver = new ChatSaver(async (b) => {
    if (fail) throw new Error("db busy");
    writes.push(b);
  }, 5);
  const warn = console.warn;
  console.warn = () => {};
  try {
    saver.update(t1);
    await saver.flush();
    assert.equal(writes.length, 0);
    fail = false;
    saver.update(t1);
    await saver.flush();
    assert.deepEqual(writes.map((w) => w.upserts.map((u) => u.id)), [["u1", "a1"]]);
    saver.update(t1);
    await saver.flush();
    assert.equal(writes.length, 1, "nothing changed, nothing written");
  } finally {
    console.warn = warn;
  }
});
