// Run: node --test "src/**/*.test.ts"
import assert from "node:assert/strict";
import { test } from "node:test";
import { canMinimize, expand, focusHintVisible, initialMinimize, MINIMIZE_GRACE_MS, minimizeIfEmpty, onCanMinimizeChange, onViewChange, type MinimizeInputs } from "./composerMinimize.ts";

const EMPTY: MinimizeInputs = { draft: "", hasAttachments: false, approvalWaiting: false, planWaiting: false };

test("an empty composer with nothing waiting can minimize; whitespace counts as empty", () => {
  assert.equal(canMinimize(EMPTY), true);
  assert.equal(canMinimize({ ...EMPTY, draft: "  \n " }), true);
});

test("text, an attachment, an approval or a plan keep it full size", () => {
  assert.equal(canMinimize({ ...EMPTY, draft: "fix it" }), false);
  assert.equal(canMinimize({ ...EMPTY, hasAttachments: true }), false);
  assert.equal(canMinimize({ ...EMPTY, approvalWaiting: true }), false);
  assert.equal(canMinimize({ ...EMPTY, planWaiting: true }), false);
});

test("the ⌘L hint shows only while unfocused, empty and the model picker is closed", () => {
  const idle = { focused: false, draft: "", hasAttachments: false, pickerOpen: false };
  assert.equal(focusHintVisible(idle), true);
  assert.equal(focusHintVisible({ ...idle, focused: true }), false);
  assert.equal(focusHintVisible({ ...idle, draft: "x" }), false);
  assert.equal(focusHintVisible({ ...idle, hasAttachments: true }), false);
  assert.equal(focusHintVisible({ ...idle, pickerOpen: true }), false);
});

test("it starts minimized only on a content tab with an empty composer, without animation", () => {
  assert.deepEqual(initialMinimize(true, true), { minimized: true, animate: false });
  assert.deepEqual(initialMinimize(false, true), { minimized: false, animate: false });
  assert.deepEqual(initialMinimize(true, false), { minimized: false, animate: false });
});

test("switching tabs snaps to the tab's state without animating", () => {
  assert.deepEqual(onViewChange({ minimized: false, animate: true }, true, true), { minimized: true, animate: false });
  assert.deepEqual(onViewChange({ minimized: true, animate: false }, false, true), { minimized: false, animate: false });
  const same = { minimized: true, animate: false };
  assert.equal(onViewChange(same, true, true), same);
});

test("typing (no longer empty) expands it with animation; emptying it again does not minimize", () => {
  assert.deepEqual(onCanMinimizeChange({ minimized: true, animate: false }, false), { minimized: false, animate: true });
  const full = { minimized: false, animate: true };
  assert.equal(onCanMinimizeChange(full, true), full);
});

test("focus or a click expands it with animation", () => {
  assert.deepEqual(expand({ minimized: true, animate: false }), { minimized: false, animate: true });
  const full = { minimized: false, animate: false };
  assert.equal(expand(full), full);
});

test("a scroll in the content tab minimizes it, but not within 500 ms of an expand", () => {
  const full = { minimized: false, animate: true };
  const at = 10_000;
  assert.deepEqual(minimizeIfEmpty(full, { viewingContent: true, can: true, now: at + MINIMIZE_GRACE_MS, expandedAt: at }), { minimized: true, animate: true });
  assert.equal(minimizeIfEmpty(full, { viewingContent: true, can: true, now: at + MINIMIZE_GRACE_MS - 1, expandedAt: at }), full);
  assert.equal(minimizeIfEmpty(full, { viewingContent: false, can: true, now: at * 2, expandedAt: at }), full);
  assert.equal(minimizeIfEmpty(full, { viewingContent: true, can: false, now: at * 2, expandedAt: at }), full);
});
