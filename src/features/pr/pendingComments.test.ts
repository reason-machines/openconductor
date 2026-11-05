import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPendingComments } from "../diff/comments.ts";
import { headerState } from "./api.ts";
import type { HeaderInputs } from "./types.ts";

const c = (state: string, is_outdated = false, is_resolved = false) => ({ state, is_outdated, is_resolved }) as Parameters<typeof hasPendingComments>[0][number];

test("a pending comment counts unless it is outdated or resolved; sent ones never do (reference `Wus`)", () => {
  assert.equal(hasPendingComments([]), false);
  assert.equal(hasPendingComments([c("sent")]), false);
  assert.equal(hasPendingComments([c("pending", true)]), false);
  assert.equal(hasPendingComments([c("pending", false, true)]), false);
  assert.equal(hasPendingComments([c("sent"), c("pending")]), true);
});

test("the browser preview's changes-requested header carries the caller's pending-comment flag", async () => {
  const store = new Map([["openconductor.pr.demo", "changes"]]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
  try {
    const inputs = { hasPendingComments: true } as HeaderInputs;
    assert.deepEqual((await headerState(inputs))?.action, { type: "changes_requested", hasPendingComments: true });
    assert.deepEqual((await headerState({ ...inputs, hasPendingComments: false }))?.action, { type: "changes_requested", hasPendingComments: false });
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
