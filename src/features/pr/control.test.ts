import { test } from "node:test";
import assert from "node:assert/strict";
import { prControl } from "./control.ts";
import { DEMO_SCENARIOS } from "./demo.ts";
import type { HeaderState, PrInfo } from "./types.ts";

const pr = (DEMO_SCENARIOS.ready().lookup.lookup as { kind: "found"; info: PrInfo }).info;
const at = (action: HeaderState["action"], tone: HeaderState["tone"] = "out_of_sync") => prControl({ tone, action }, pr);

test("no header state hides the control", () => {
  assert.equal(prControl(null, null), null);
});

test("create and merge are the actionable intents", () => {
  assert.equal(prControl({ tone: "no_pr", action: { type: "create_pr" } }, null)?.intent, "create");
  const merge = at({ type: "ready_to_merge", optionalFailed: 0 }, "in_sync");
  assert.deepEqual([merge?.intent, merge?.label, merge?.title], ["merge", "Merge", "Merge PR #42"]);
  assert.match(at({ type: "ready_to_merge", optionalFailed: 2 })!.title, /2 optional checks failed/);
  for (const action of [{ type: "merged" }, { type: "draft_pr" }, { type: "blocked" }] as const) {
    assert.equal(at(action)?.intent, "status");
  }
});

test("check counts read naturally", () => {
  assert.equal(at({ type: "checks_failing", failed: 2, total: 9, pending: 1, fixable: true })?.label, "2/9 checks failed");
  assert.equal(at({ type: "checks_failing", failed: 1, total: null, pending: 0, fixable: false })?.label, "1 check failed");
  assert.equal(at({ type: "checks_failing", failed: 1, total: 3, pending: 2, fixable: true })?.title, "1 check failed, 2 still running");
  assert.equal(at({ type: "checks_pending", pending: 1 })?.title, "1 check still running");
});

test("sync and PR states carry the PR number and commit counts", () => {
  assert.equal(at({ type: "merged" }, "merged")?.label, "Merged #42");
  assert.equal(at({ type: "push", ahead: 3 })?.label, "Push 3");
  assert.equal(at({ type: "pull", behind: 1 })?.title, "Remote branch has 1 commit this workspace does not");
  assert.match(at({ type: "queued_to_merge", state: "AWAITING_CHECKS" })!.title, /awaiting checks/);
  assert.equal(prControl({ tone: "no_pr", action: { type: "draft_pr" } }, null)?.label, "Draft PR");
});
