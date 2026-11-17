import assert from "node:assert/strict";
import { test } from "node:test";
import { readClipboardText, type ReadClipboard } from "./composerPasteFilePaths.ts";

function clip(text: string): ReadClipboard {
  return { readText: async () => text };
}

test("returns clipboard text", async () => {
  assert.equal(await readClipboardText(clip("/Users/sven/project/foo.ts")), "/Users/sven/project/foo.ts");
});

test("returns null for empty string", async () => {
  assert.equal(await readClipboardText(clip("")), null);
});

test("returns null on read failure", async () => {
  const failing: ReadClipboard = { readText: async () => { throw new Error("Permission denied"); } };
  assert.equal(await readClipboardText(failing), null);
});

test("returns multiline paths unchanged", async () => {
  const text = "/Users/sven/a.ts\n/Users/sven/b.ts";
  assert.equal(await readClipboardText(clip(text)), text);
});

test("returns whitespace-only text unchanged (not filtered)", async () => {
  // The empty-string guard applies to ""; whitespace is legitimate clipboard content.
  assert.equal(await readClipboardText(clip("   ")), "   ");
});
