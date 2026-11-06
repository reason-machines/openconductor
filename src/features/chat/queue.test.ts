// Run: node --test "src/**/*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actionStep,
  beginEdit,
  cancelEdit,
  canSteerNow,
  emptyQueue,
  headStatusLabel,
  move,
  remove,
  reorder,
  resolveSendMode,
  resume,
  saveEdit,
  steerQueued,
  stop,
  submit,
  turnEnded,
  type ChatQueue,
} from "./queue.ts";

const now = new Date("2026-11-05T10:00:00.000Z");
const texts = (q: ChatQueue) => q.items.map((m) => m.text);

function working(...queued: string[]): ChatQueue {
  let q = submit(emptyQueue(), "first", "queue", now).queue;
  for (const t of queued) q = submit(q, t, "queue", now).queue;
  return q;
}

test("send mode: steering by default, the opposite key queues, non-steering agents always queue", () => {
  assert.equal(resolveSendMode({ canSteer: true, defaultMode: "steering" }), "steer");
  assert.equal(resolveSendMode({ canSteer: true, defaultMode: "steering", opposite: true }), "queue");
  assert.equal(resolveSendMode({ canSteer: true, defaultMode: "queued" }), "queue");
  assert.equal(resolveSendMode({ canSteer: true, defaultMode: "queued", opposite: true }), "steer");
  assert.equal(resolveSendMode({ canSteer: false, defaultMode: "steering" }), "queue");
  assert.equal(resolveSendMode({ canSteer: false, defaultMode: "queued", opposite: true }), "queue");
});

test("idle submit starts a turn; blank text does nothing", () => {
  const r = submit(emptyQueue(), "hello", "queue", now);
  assert.deepEqual(r.effects, [{ kind: "start", text: "hello", attachments: [] }]);
  assert.equal(r.queue.status, "working");
  assert.deepEqual(submit(emptyQueue(), "  \n", "steer", now).effects, []);
});

test("attachment-only messages start, steer, queue and survive a blank queue edit", () => {
  const attachments = [{ name: "notes.txt", text: "Review these notes" }];
  const started = submit(emptyQueue(), "", "queue", now, attachments);
  assert.deepEqual(started.effects, [{ kind: "start", text: "", attachments }]);
  const q = working();
  assert.deepEqual(submit(q, "", "steer", now, attachments).effects, [{ kind: "steer", text: "", attachments }]);
  const queued = submit(q, "", "queue", now, attachments).queue;
  assert.equal(queued.items.length, 1);
  const edited = saveEdit(beginEdit(queued, queued.items[0]!.id), "");
  assert.deepEqual(edited.queue.items[0]?.attachments, attachments);
  assert.deepEqual(turnEnded(edited.queue, "completed").effects, [{ kind: "start", text: "", attachments }]);
});

test("while working, steer goes into the turn and queue waits for the turn to end", () => {
  const q = working();
  const steer = submit(q, "also do X", "steer", now);
  assert.deepEqual(steer.effects, [{ kind: "steer", text: "also do X", attachments: [] }]);
  assert.deepEqual(steer.queue.items, []);

  const queued = submit(q, "then Y", "queue", now);
  assert.deepEqual(queued.effects, []);
  assert.deepEqual(texts(queued.queue), ["then Y"]);
  assert.equal(headStatusLabel(queued.queue), "Queued");
});

test("a completed turn sends the head, one per turn, in order", () => {
  let q = working("a", "b");
  let r = turnEnded(q, "completed");
  assert.deepEqual(r.effects, [{ kind: "start", text: "a", attachments: [] }]);
  assert.equal(r.queue.status, "working");
  assert.deepEqual(texts(r.queue), ["b"]);
  r = turnEnded(r.queue, "completed");
  assert.deepEqual(r.effects, [{ kind: "start", text: "b", attachments: [] }]);
  r = turnEnded(r.queue, "completed");
  assert.deepEqual(r.effects, []);
  assert.equal(r.queue.status, "idle");
});

test("a superseded turn keeps the session working and sends nothing", () => {
  const r = turnEnded(working("a"), "completed", true);
  assert.deepEqual(r.effects, []);
  assert.equal(r.queue.status, "working");
});

test("a failed turn pauses a non-empty queue; resume sends the head", () => {
  const failed = turnEnded(working("a"), "failed");
  assert.deepEqual(failed.effects, []);
  assert.equal(failed.queue.status, "error");
  assert.equal(failed.queue.paused, true);
  assert.equal(headStatusLabel(failed.queue), "Queue paused");
  // A new message joins the paused queue instead of jumping it.
  const more = submit(failed.queue, "b", "queue", now);
  assert.deepEqual(more.effects, []);
  assert.deepEqual(texts(more.queue), ["a", "b"]);
  const resumed = resume(more.queue);
  assert.deepEqual(resumed.effects, [{ kind: "start", text: "a", attachments: [] }]);
  assert.equal(resumed.queue.paused, false);
});

test("a failed turn with nothing queued leaves the next message free to start", () => {
  const failed = turnEnded(working(), "failed").queue;
  assert.equal(failed.paused, false);
  assert.deepEqual(submit(failed, "retry", "queue", now).effects, [{ kind: "start", text: "retry", attachments: [] }]);
});

test("a cancelled turn does not pause: the head sends after the cancellation", () => {
  const s = stop(working("a"));
  assert.deepEqual(s.effects, [{ kind: "cancel", hard: false }]);
  assert.equal(s.queue.status, "cancelling");
  assert.equal(headStatusLabel(s.queue), "Waiting for cancellation");
  // Steering is not possible while cancelling; the message queues.
  assert.deepEqual(submit(s.queue, "b", "steer", now).effects, []);
  const r = turnEnded(s.queue, "cancelled");
  assert.deepEqual(r.effects, [{ kind: "start", text: "a", attachments: [] }]);
});

test("Stop: second press is a hard stop; idle Stop does nothing", () => {
  const first = stop(working());
  assert.deepEqual(stop(first.queue).effects, [{ kind: "cancel", hard: true }]);
  assert.deepEqual(stop(emptyQueue()).effects, []);
});

test("delete, reorder and move queued messages", () => {
  let q = working("a", "b", "c");
  const [a, b, c] = q.items.map((m) => m.id);
  assert.deepEqual(texts(reorder(q, [c!, a!])), ["c", "a", "b"]);
  assert.deepEqual(texts(reorder(q, ["nope", b!])), ["b", "a", "c"]);
  assert.deepEqual(texts(move(q, a!, 1)), ["b", "a", "c"]);
  assert.deepEqual(texts(move(q, a!, -1)), ["a", "b", "c"]);
  q = remove(q, b!).queue;
  assert.deepEqual(texts(q), ["a", "c"]);
});

test("deleting the last item while idle and paused leaves nothing to send", () => {
  const failed = turnEnded(working("a"), "failed").queue;
  const r = remove(failed, failed.items[0]!.id);
  assert.deepEqual(r.effects, []);
  assert.deepEqual(r.queue.items, []);
});

test("an edited head does not send until the edit is saved or cancelled", () => {
  let q = working("a", "b");
  const head = q.items[0]!.id;
  q = beginEdit(q, head);
  assert.equal(headStatusLabel(q), "Editing queued message");
  let r = turnEnded(q, "completed");
  assert.deepEqual(r.effects, []);
  assert.equal(r.queue.status, "idle");
  r = saveEdit(r.queue, "a2");
  assert.deepEqual(r.effects, [{ kind: "start", text: "a2", attachments: [] }]);

  q = beginEdit(working("a"), working("a").items[0]!.id);
  q = turnEnded(q, "completed").queue;
  assert.deepEqual(cancelEdit(q).effects, [{ kind: "start", text: "a", attachments: [] }]);
});

test("save and steer sends the edited text into the running turn", () => {
  let q = working("a", "b");
  q = beginEdit(q, q.items[1]!.id);
  const r = saveEdit(q, "b2", true);
  assert.deepEqual(r.effects, [{ kind: "steer", text: "b2", attachments: [] }]);
  assert.deepEqual(texts(r.queue), ["a"]);
  assert.equal(r.queue.editingId, null);
});

test("saving an edit as blank deletes the message", () => {
  let q = working("a");
  q = beginEdit(q, q.items[0]!.id);
  assert.deepEqual(saveEdit(q, "   ").queue.items, []);
});

test("steer a queued message: into the running turn, or start it when idle", () => {
  const q = working("a", "b");
  const r = steerQueued(q, q.items[1]!.id);
  assert.deepEqual(r.effects, [{ kind: "steer", text: "b", attachments: [] }]);
  assert.deepEqual(texts(r.queue), ["a"]);
  assert.equal(canSteerNow(q, true), true);
  assert.equal(canSteerNow(q, false), false);

  const failed = turnEnded(working("a"), "failed").queue;
  const s = steerQueued(failed, failed.items[0]!.id);
  assert.deepEqual(s.effects, [{ kind: "start", text: "a", attachments: [] }]);
  assert.equal(s.queue.paused, false);

  const cancelling = stop(working("a")).queue;
  assert.deepEqual(steerQueued(cancelling, cancelling.items[0]!.id).effects, []);
  assert.equal(canSteerNow(cancelling, true), false);
});

test("a queued message keeps its attachments until it sends", () => {
  const file = { name: "revert-note.md", text: "reverted a.txt" };
  let s = submit(emptyQueue(), "first", "queue");
  s = submit(s.queue, "with a file", "queue", new Date(), [file]);
  assert.deepEqual(s.queue.items[0]!.attachments, [file]);
  s = turnEnded(s.queue, "completed");
  assert.deepEqual(s.effects, [{ kind: "start", text: "with a file", attachments: [file] }]);
});

test("a permission request holds the turn: follow-ups queue, Stop cancels, an answer resumes working", async () => {
  const { waitingOn, turnRunning } = await import("./queue.ts");
  let q = submit(emptyQueue(), "go", "queue").queue;
  q = waitingOn(q, "needs_user_permission");
  assert.equal(q.status, "needs_user_permission");
  assert.ok(turnRunning(q.status));
  assert.equal(canSteerNow(q, true), false, "nothing to steer into while Reason waits on the user");

  const followUp = submit(q, "and then", "steer");
  assert.deepEqual(followUp.effects, [], "the follow-up waits");
  assert.equal(followUp.queue.items.length, 1);
  assert.deepEqual(steerQueued(followUp.queue, followUp.queue.items[0]!.id).effects, []);

  assert.equal(waitingOn(q, null).status, "working");
  assert.equal(waitingOn(q, "needs_plan_response").status, "needs_plan_response", "a plan takes over");
  assert.equal(waitingOn(emptyQueue(), "needs_user_input").status, "idle", "only a running turn asks");
  assert.equal(waitingOn(emptyQueue(), null).status, "idle");

  const stopped = stop(q);
  assert.equal(stopped.queue.status, "cancelling");
  assert.deepEqual(stopped.effects, [{ kind: "cancel", hard: false }]);
});

test("queue-panel actions run through actionStep (shared by the Reason and Codex chats)", () => {
  let q = submit(emptyQueue(), "first", "queue").queue;
  q = submit(q, "second", "queue").queue;
  q = submit(q, "third", "queue").queue;
  assert.deepEqual(q.items.map((m) => m.text), ["second", "third"]);
  const moved = actionStep(q, { kind: "move", id: q.items[1]!.id, by: -1 });
  assert.ok(!("effects" in moved));
  assert.deepEqual(moved.items.map((m) => m.text), ["third", "second"]);
  const idle = turnEnded(moved, "completed");
  assert.deepEqual(idle.effects, [{ kind: "start", text: "third", attachments: [] }]);
  const del = actionStep(idle.queue, { kind: "delete", id: idle.queue.items[0]!.id });
  assert.ok("effects" in del);
  assert.deepEqual(del.queue.items, []);
});
