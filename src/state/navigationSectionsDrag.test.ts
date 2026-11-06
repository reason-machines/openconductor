import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDragSection,
  canDragWorkspace,
  insertionIndexAt,
  reorderIndicator,
  reorderSection,
  reorderTarget,
  reorderToIndex,
  workspaceDropAction,
  workspaceDropTarget,
  type NavSection,
} from "./navigationSections.ts";

const sec = (id: string, workspaceIds: string[] = []): NavSection => ({ id, name: id.toUpperCase(), workspaceIds });

test("dropping a row: a section assigns, Pinned pins, My workspaces unpins or unassigns", () => {
  const l = [sec("a", ["w1"]), sec("b")];
  assert.deepEqual(workspaceDropAction(l, "w1", false, { type: "section", sectionId: "b" }), { kind: "assign", sectionId: "b" });
  assert.deepEqual(workspaceDropAction(l, "w2", false, { type: "section", sectionId: "b" }), { kind: "assign", sectionId: "b" });
  assert.deepEqual(workspaceDropAction(l, "w1", false, { type: "pinned" }), { kind: "pin" });
  assert.deepEqual(workspaceDropAction(l, "w1", false, { type: "unsectioned" }), { kind: "unassign" });
  assert.deepEqual(workspaceDropAction(l, "w2", true, { type: "unsectioned" }), { kind: "unpin" });
  assert.equal(workspaceDropAction(l, "w2", false, undefined), undefined);
  assert.equal(workspaceDropAction(l, "w2", false, { type: "reorder", insertionIndex: 0 }), undefined);
});

test("a drop that leaves the row where it is has no target", () => {
  const l = [sec("a", ["w1"]), sec("b")];
  assert.equal(workspaceDropTarget(l, "w1", false, { type: "section", sectionId: "a" }), undefined);
  assert.equal(workspaceDropTarget(l, "w2", true, { type: "pinned" }), undefined);
  assert.equal(workspaceDropTarget(l, "w2", false, { type: "unsectioned" }), undefined);
  assert.deepEqual(workspaceDropTarget(l, "w1", false, { type: "unsectioned" }), { type: "unsectioned" });
  assert.equal(workspaceDropAction(l, "w1", false, { type: "section", sectionId: "a" }), undefined);
});

test("a row drags only when some drop could move it", () => {
  assert.equal(canDragWorkspace([], "w1", false, { pinned: false, unsectioned: true }), false);
  assert.equal(canDragWorkspace([], "w1", false, { pinned: true, unsectioned: true }), true);
  assert.equal(canDragWorkspace([], "w1", true, { pinned: true, unsectioned: false }), false);
  assert.equal(canDragWorkspace([], "w1", true, { pinned: true, unsectioned: true }), true);
  assert.equal(canDragWorkspace([sec("a")], "w1", false, { pinned: false, unsectioned: false }), true);
});

test("sections reorder only with two or more", () => {
  assert.equal(canDragSection([sec("a")], "a"), false);
  assert.equal(canDragSection([sec("a"), sec("b")], "a"), true);
  assert.equal(canDragSection([sec("a"), sec("b")], "zz"), false);
});

test("section reorder: midpoint insertion, no-op neighbours, toIndex and the line", () => {
  const l = [sec("a"), sec("b"), sec("c")];
  const rects = new Map([["a", { top: 0, height: 40 }], ["b", { top: 40, height: 40 }], ["c", { top: 80, height: 40 }]]);
  assert.equal(insertionIndexAt(10, l, rects), 0);
  assert.equal(insertionIndexAt(30, l, rects), 1);
  assert.equal(insertionIndexAt(119, l, rects), 3);
  assert.equal(insertionIndexAt(10, l, new Map()), undefined);
  assert.equal(reorderTarget(l, "a", 0), undefined);
  assert.equal(reorderTarget(l, "a", 1), undefined);
  assert.deepEqual(reorderTarget(l, "a", 3), { type: "reorder", insertionIndex: 3 });
  assert.equal(reorderToIndex(l, "a", { type: "reorder", insertionIndex: 3 }), 2);
  assert.equal(reorderToIndex(l, "c", { type: "reorder", insertionIndex: 0 }), 0);
  assert.equal(reorderToIndex(l, "b", { type: "reorder", insertionIndex: 2 }), undefined);
  assert.deepEqual(reorderSection(l, "a", reorderToIndex(l, "a", { type: "reorder", insertionIndex: 3 })!).map((s) => s.id), ["b", "c", "a"]);
  assert.equal(reorderIndicator({ type: "reorder", insertionIndex: 1 }, 1, false), "above");
  assert.equal(reorderIndicator({ type: "reorder", insertionIndex: 3 }, 2, true), "below");
  assert.equal(reorderIndicator({ type: "reorder", insertionIndex: 3 }, 1, false), undefined);
  assert.equal(reorderIndicator(undefined, 0, true), undefined);
});
