import { test } from "node:test";
import assert from "node:assert/strict";
import { canGoBack, canGoForward, current, prune, startHistory, step, visit } from "./history.ts";
import type { Selection } from "./types.ts";

const home: Selection = { kind: "home" };
const ws = (id: string): Selection => ({ kind: "workspace", repoId: "r", workspaceId: id });

test("a fresh history can go neither way", () => {
  const h = startHistory(home);
  assert.equal(canGoBack(h), false);
  assert.equal(canGoForward(h), false);
});

test("back then forward returns to where you were", () => {
  let h = visit(visit(startHistory(home), ws("a")), ws("b"));
  h = step(h, -1);
  assert.deepEqual(current(h), ws("a"));
  assert.equal(canGoForward(h), true);
  h = step(h, 1);
  assert.deepEqual(current(h), ws("b"));
  assert.equal(canGoForward(h), false);
});

test("visiting after going back drops the forward entries", () => {
  let h = visit(visit(startHistory(home), ws("a")), ws("b"));
  h = visit(step(h, -1), ws("c"));
  assert.deepEqual(h.entries, [home, ws("a"), ws("c")]);
  assert.equal(canGoForward(h), false);
});

test("re-selecting the current entry does not add a step", () => {
  const h = visit(startHistory(home), ws("a"));
  assert.equal(visit(h, ws("a")), h);
});

test("stepping past either end stays put", () => {
  const h = startHistory(home);
  assert.equal(step(h, -1), h);
  assert.equal(step(h, 1), h);
});

test("prune drops archived workspaces and keeps the position", () => {
  let h = visit(visit(visit(startHistory(home), ws("a")), ws("b")), ws("c"));
  h = step(h, -1); // at b
  h = prune(h, (s) => !(s.kind === "workspace" && s.workspaceId === "a"));
  assert.deepEqual(h.entries, [home, ws("b"), ws("c")]);
  assert.deepEqual(current(h), ws("b"));
});
