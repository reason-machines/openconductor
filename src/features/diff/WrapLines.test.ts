import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VIEW_OPTIONS } from "./types.ts";

test("lines wrap by default, as with Conductor's wrap_lines setting", () => {
  assert.equal(DEFAULT_VIEW_OPTIONS.wrapLines, true);
});
