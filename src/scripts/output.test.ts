import { test } from "node:test";
import assert from "node:assert/strict";
import { outputUpdate } from "./output.ts";

test("growing snapshots append only the new bytes, preserving split ANSI sequences", () => {
  assert.deepEqual(outputUpdate("", "\x1b[3"), { reset: false, data: "\x1b[3" });
  assert.deepEqual(outputUpdate("\x1b[3", "\x1b[32mReady\x1b[0m"), { reset: false, data: "2mReady\x1b[0m" });
  assert.deepEqual(outputUpdate("Ready", "Ready"), { reset: false, data: "" });
});

test("a rerun or a trimmed snapshot replaces the screen instead of retaining stale rows", () => {
  assert.deepEqual(outputUpdate("Old run\n", ""), { reset: true, data: "" });
  assert.deepEqual(outputUpdate("Old run\n", "New run\n"), { reset: true, data: "New run\n" });
  assert.deepEqual(outputUpdate("first\nlast\n", "last\n"), { reset: true, data: "last\n" });
});
