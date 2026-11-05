import { test } from "node:test";
import assert from "node:assert/strict";
import { planPrEdit, prEditErrorMessage, retargetErrorMessage } from "./edit.ts";

const current = { title: "Add checks tab", body: "Lists CI checks." };

test("a title edit is trimmed and sent only when it changed", () => {
  assert.deepEqual(planPrEdit(current, { title: "  Add the Checks tab  " }), { kind: "update", title: "Add the Checks tab" });
  assert.deepEqual(planPrEdit(current, { title: " Add checks tab " }), { kind: "noop" });
});

test("an empty title is refused", () => {
  assert.deepEqual(planPrEdit(current, { title: "   " }), { kind: "invalid", message: "PR title cannot be empty" });
});

test("a body edit is sent as typed, including an empty body", () => {
  assert.deepEqual(planPrEdit(current, { body: "" }), { kind: "update", body: "" });
  assert.deepEqual(planPrEdit(current, { body: "Lists CI checks." }), { kind: "noop" });
  assert.deepEqual(planPrEdit(current, { body: "  spaced  " }), { kind: "update", body: "  spaced  " });
});

test("nothing to edit is a no-op", () => {
  assert.deepEqual(planPrEdit(current, {}), { kind: "noop" });
});

test("edit errors name GitHub, with a read:org hint when the token lacks it", () => {
  assert.equal(prEditErrorMessage(new Error("HTTP 422")), "Failed to update PR on GitHub: HTTP 422");
  assert.match(prEditErrorMessage("missing required scopes [read:org]"), /read:org scope/);
});

test("a refused retarget names the base branch", () => {
  assert.equal(retargetErrorMessage(new Error("no such branch")), "Failed to change the PR's base branch: no such branch");
});
