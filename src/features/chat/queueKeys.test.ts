// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { dropOrder, queueRowKey, type QueueCommand } from "./queueKeys.ts";

const IDS = ["a", "b", "c"];
const press = (command: QueueCommand | null) => (c: QueueCommand) => c === command;

test("E edits the focused row, ⌫ deletes it and focuses the next row, else the previous one", () => {
  assert.deepEqual(queueRowKey(IDS, "b", "e", press("chat.queue.editMessage"), true), { kind: "edit", id: "b" });
  assert.deepEqual(queueRowKey(IDS, "b", "Backspace", press("chat.queue.deleteMessage"), true), { kind: "delete", id: "b", focus: { row: "c" } });
  assert.deepEqual(queueRowKey(IDS, "c", "Backspace", press("chat.queue.deleteMessage"), true), { kind: "delete", id: "c", focus: { row: "b" } });
  assert.deepEqual(queueRowKey(["a"], "a", "Backspace", press("chat.queue.deleteMessage"), true), { kind: "delete", id: "a", focus: "composer" });
});

test("↵ steers only when the agent can steer, then focuses the next row or the composer", () => {
  assert.deepEqual(queueRowKey(IDS, "a", "Enter", press("chat.queue.steerMessage"), true), { kind: "steer", id: "a", focus: { row: "b" } });
  assert.deepEqual(queueRowKey(["a"], "a", "Enter", press("chat.queue.steerMessage"), true), { kind: "steer", id: "a", focus: "composer" });
  assert.equal(queueRowKey(IDS, "a", "Enter", press("chat.queue.steerMessage"), false), null);
});

test("arrows, Home and End move between rows; ↓ past the last row and Esc go to the composer", () => {
  const none = press(null);
  assert.deepEqual(queueRowKey(IDS, "a", "ArrowDown", none, true), { kind: "focus", focus: { row: "b" } });
  assert.deepEqual(queueRowKey(IDS, "c", "ArrowDown", none, true), { kind: "focus", focus: "composer" });
  assert.deepEqual(queueRowKey(IDS, "b", "ArrowUp", none, true), { kind: "focus", focus: { row: "a" } });
  assert.deepEqual(queueRowKey(IDS, "a", "ArrowUp", none, true), { kind: "focus", focus: { row: "a" } });
  assert.deepEqual(queueRowKey(IDS, "b", "Home", none, true), { kind: "focus", focus: { row: "a" } });
  assert.deepEqual(queueRowKey(IDS, "a", "End", none, true), { kind: "focus", focus: { row: "c" } });
  assert.deepEqual(queueRowKey(IDS, "b", "Escape", none, true), { kind: "focus", focus: "composer" });
  assert.equal(queueRowKey(IDS, "b", "x", none, true), null);
  assert.equal(queueRowKey(IDS, "zz", "ArrowDown", none, true), null);
});

test("a drop puts the dragged row in the target's place", () => {
  assert.deepEqual(dropOrder(IDS, "a", "c"), ["b", "c", "a"]);
  assert.deepEqual(dropOrder(IDS, "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(dropOrder(IDS, "b", "b"), IDS);
  assert.deepEqual(dropOrder(IDS, "x", "a"), IDS);
});
