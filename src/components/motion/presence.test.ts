import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPhase, presenceAttrs, type Phase, type PresenceEvent } from "./presence.ts";

const run = (start: Phase, events: PresenceEvent[]) => events.reduce(nextPhase, start);

test("opening renders one frame with the starting style, then the open style", () => {
  assert.equal(run("closed", ["show"]), "starting");
  assert.deepEqual(presenceAttrs("starting"), { "data-starting-style": "" });
  assert.equal(run("closed", ["show", "frame"]), "open");
  assert.deepEqual(presenceAttrs("open"), {});
});

test("closing keeps the element mounted with the ending style until the exit has run", () => {
  assert.equal(run("open", ["hide"]), "ending");
  assert.deepEqual(presenceAttrs("ending"), { "data-ending-style": "" });
  assert.equal(run("open", ["hide", "frame"]), "ending");
  assert.equal(run("open", ["hide", "exited"]), "closed");
});

test("reopening during the exit returns to open without remounting", () => {
  assert.equal(run("open", ["hide", "show"]), "open");
  assert.equal(run("open", ["hide", "show", "exited"]), "open");
});

test("closing before the first frame still exits", () => {
  assert.equal(run("closed", ["show", "hide", "frame", "exited"]), "closed");
});

test("events that do not apply leave the phase alone", () => {
  assert.equal(run("closed", ["hide", "frame", "exited"]), "closed");
  assert.equal(run("open", ["show", "frame", "exited"]), "open");
});

import { entryOnce, keepLeaving } from "./presence.ts";

test("a dismissed toast stays in place, marked leaving, while new ones append", () => {
  const id = (t: { id: number }) => t.id;
  const a = { id: 1 }, b = { id: 2 }, c = { id: 3 };
  let shown = keepLeaving([], [a, b], id);
  assert.deepEqual(shown.map((s) => [s.item.id, s.leaving]), [[1, false], [2, false]]);
  shown = keepLeaving(shown, [b, c], id);
  assert.deepEqual(shown.map((s) => [s.item.id, s.leaving]), [[1, true], [2, false], [3, false]]);
  // Once dropped after its exit, it is gone for good.
  shown = keepLeaving(shown.filter((s) => !s.leaving), [b, c], id);
  assert.deepEqual(shown.map((s) => [s.item.id, s.leaving]), [[2, false], [3, false]]);
});

test("an item that comes back while leaving is live again with its new value", () => {
  const id = (t: { id: number; v: string }) => t.id;
  const shown = keepLeaving([{ item: { id: 1, v: "old" }, leaving: true }], [{ id: 1, v: "new" }], id);
  assert.deepEqual(shown, [{ item: { id: 1, v: "new" }, leaving: false }]);
});

test("a toast plays its entry once, not again when its toaster remounts", () => {
  const entries = entryOnce(new Set<number>());
  assert.equal(entries.pending(1), true);
  assert.equal(entries.pending(1), true, "reading during render changes nothing");
  entries.played(1);
  assert.equal(entries.pending(1), false);
  assert.equal(entries.pending(2), true);
});
