import { test } from "node:test";
import assert from "node:assert/strict";
import { isRootChange } from "./rootPathModel.ts";

test("only a picked folder other than the current root asks to change it", () => {
  assert.equal(isRootChange("/data/oc", "/Users/me/oc"), true);
  assert.equal(isRootChange("/data/oc", "/data/oc"), false);
  assert.equal(isRootChange("/data/oc", null), false, "picker cancelled");
  assert.equal(isRootChange(null, "/Users/me/oc"), false, "root not loaded yet");
});
