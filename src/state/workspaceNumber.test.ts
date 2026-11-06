import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceNumberLabel } from "./workspaceNumber.ts";

test("a numbered workspace reads W-<n>; one from before numbering has no label", () => {
  assert.equal(workspaceNumberLabel(12), "W-12");
  assert.equal(workspaceNumberLabel(0), "W-0");
  assert.equal(workspaceNumberLabel(null), null);
  assert.equal(workspaceNumberLabel(undefined), null);
});
