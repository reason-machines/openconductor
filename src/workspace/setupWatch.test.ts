import { test } from "node:test";
import assert from "node:assert/strict";
import type { ScriptEvent } from "../scripts/model.ts";
import { SETUP_FAILED_TOAST, handleScriptEvent, isWatching, reduceWatch, unwatchSetup, watchSetup } from "./setupWatch.ts";

const finished = (workspaceId: string, state: "completed" | "failed" | "cancelled"): ScriptEvent => ({
  type: "setupFinished",
  workspaceId,
  state,
  exitCode: state === "failed" ? 1 : state === "completed" ? 0 : null,
  logPath: `/tmp/${workspaceId}.log`,
  log: "",
});

test("a failed setup the create flow started toasts and stops watching", () => {
  const step = reduceWatch(new Set(["w1"]), finished("w1", "failed"));
  assert.equal(step.toast, SETUP_FAILED_TOAST);
  assert.equal(step.toast, "Setup script failed. Check the setup tab for logs.");
  assert.deepEqual([...step.watching], []);
});

test("completed or cancelled setup clears the flag without a toast", () => {
  for (const state of ["completed", "cancelled"] as const) {
    const step = reduceWatch(new Set(["w1", "w2"]), finished("w1", state));
    assert.equal(step.toast, null);
    assert.deepEqual([...step.watching], ["w2"]);
  }
});

test("output events and setups the create flow did not start are ignored", () => {
  const watching = new Set(["w1"]);
  const out: ScriptEvent = { type: "output", workspaceId: "w1", kind: "setup", scriptId: "setup", chunk: "x" };
  assert.equal(reduceWatch(watching, out).watching, watching);
  // A rerun from the Setup tab fails: that tab shows it, so no toast here.
  assert.deepEqual(reduceWatch(watching, finished("other", "failed")), { watching, toast: null });
});

test("watch, finish and unwatch through the module store", () => {
  watchSetup("a");
  watchSetup("b");
  assert.ok(isWatching("a") && isWatching("b"));
  assert.equal(handleScriptEvent(finished("a", "failed")), SETUP_FAILED_TOAST);
  assert.equal(isWatching("a"), false);
  assert.equal(handleScriptEvent(finished("a", "failed")), null, "a second finish for the same id is not toasted again");
  unwatchSetup("b");
  assert.equal(isWatching("b"), false);
});
