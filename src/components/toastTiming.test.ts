import { test } from "node:test";
import assert from "node:assert/strict";
import { toastTimeout } from "./toastTiming.ts";

test("errors stay 8 s and info 4 s unless sticky", () => {
  assert.equal(toastTimeout({ kind: "error" }), 8000);
  assert.equal(toastTimeout({ kind: "info" }), 4000);
});

test("a sticky toast stays until dismissed", () => {
  assert.equal(toastTimeout({ kind: "error", sticky: true }), null);
  assert.equal(toastTimeout({ kind: "info", sticky: true }), null);
});
