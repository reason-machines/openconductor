import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedStatusChange } from "./workspaceSync.ts";

test("a derived status is stored only when it differs from the stored one", () => {
  assert.equal(derivedStatusChange("in-review", "in-review"), null);
  assert.equal(derivedStatusChange("in-progress", "in-review"), "in-review");
  assert.equal(derivedStatusChange("in-review", "done"), "done");
  // None stored reads as the column default, in progress.
  assert.equal(derivedStatusChange(undefined, "in-progress"), null);
  assert.equal(derivedStatusChange(null, "canceled"), "canceled");
});
