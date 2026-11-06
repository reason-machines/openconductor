import { test } from "node:test";
import assert from "node:assert/strict";
import { LogBuffer, formatLine, tailBytes } from "./consoleLog.ts";

test("tailBytes keeps short text and cuts long text after a newline", () => {
  assert.equal(tailBytes("abc", 10), "abc");
  assert.equal(tailBytes("line one\nline two\nline three", 14), "line three");
  assert.equal(tailBytes("no newlines at all", 5), "t all");
});

test("formatLine stamps time and level and renders errors and objects", () => {
  const at = new Date("2026-11-06T10:00:00Z");
  assert.equal(formatLine("warn", ["x", { a: 1 }, 2], at), "2026-11-06T10:00:00.000Z [WARN] x {\"a\":1} 2");
  const e = new Error("boom");
  e.stack = "Error: boom\n    at here";
  assert.equal(formatLine("error", [e], at), "2026-11-06T10:00:00.000Z [ERROR] Error: boom\n    at here");
});

test("LogBuffer drops its oldest lines and exports at most its limit", () => {
  const b = new LogBuffer(20);
  for (let i = 0; i < 10; i++) b.push(`line ${i}`);
  const text = b.text();
  assert.ok(new TextEncoder().encode(text).length <= 20);
  assert.ok(text.endsWith("line 9"));
  assert.ok(!text.includes("line 0"));
});
