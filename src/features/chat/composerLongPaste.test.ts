import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPOSER_CLIPBOARD } from "./composerDocument.ts";
import { longPasteAttachment } from "./composerLongPaste.ts";

function clipboard(text: string, custom = "", items: { kind: string; type: string }[] = []) {
  return { items, getData: (format: string) => format === "text/plain" ? text : format === COMPOSER_CLIPBOARD ? custom : "" };
}

const now = new Date(2026, 10, 10, 8, 9, 7);

for (const [name, text] of [
  ["5001 UTF-16 code units", "x".repeat(5001)],
  ["91 newline-split lines", Array(91).fill("row").join("\n")],
  ["surrogate pairs counted as two units", "\u{1f600}".repeat(2501)],
  ["unnormalized clipboard text", "x".repeat(5001) + "\r\nlast\r"],
]) {
  test(`long paste attaches ${name} as the original text/plain file`, async () => {
    const file = longPasteAttachment(clipboard(text), true, now);
    assert.ok(file);
    assert.equal(file.name, "pasted_text_2026-11-10_08-09-07.txt");
    assert.equal(file.type, "text/plain");
    assert.equal(await file.text(), text);
  });
}

test("empty text, exact thresholds, short text and a disabled setting stay on the editor path", () => {
  for (const text of ["", "ordinary", "x".repeat(5000), Array(90).fill("row").join("\n"), "\u{1f600}".repeat(2500), Array(91).fill("row").join("\r")]) {
    assert.equal(longPasteAttachment(clipboard(text), true, now), null);
  }
  assert.equal(longPasteAttachment(clipboard("x".repeat(5001)), false, now), null);
});

test("ordinary file and image clipboards take precedence over large text", () => {
  for (const type of ["text/plain", "image/png", "application/zip", ""]) {
    assert.equal(longPasteAttachment(clipboard("x".repeat(5001), "", [{ kind: "file", type }]), true, now), null);
  }
});

test("valid atomic composer data keeps its editor path; malformed custom data falls back to text", () => {
  const text = "x".repeat(5001);
  for (const parts of [[], [{ kind: "text", text: "custom text" }], [{ kind: "file", path: "src/app.ts", label: "app.ts", directory: false }]]) {
    assert.equal(longPasteAttachment(clipboard(text, JSON.stringify(parts)), true, now), null);
  }
  for (const custom of ["not json", "{}", '[{"kind":"file","path":""}]']) {
    assert.ok(longPasteAttachment(clipboard(text, custom), true, now));
  }
});
