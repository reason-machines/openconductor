// Tests for the UTF-8 byte-offset → JS char-index conversion and the
// highlight-segment splitter used by SearchInFilesDialog.
// Run: node --test "src/components/searchInFilesHighlight.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { utf8ByteToCharIndex, highlightSegments } from "./searchInFilesHighlight.ts";

// --- utf8ByteToCharIndex ---

test("ASCII strings: byte offset equals char index", () => {
  assert.equal(utf8ByteToCharIndex("hello", 0), 0);
  assert.equal(utf8ByteToCharIndex("hello", 3), 3);
  assert.equal(utf8ByteToCharIndex("hello", 5), 5);
});

test("2-byte codepoints (U+0080–U+07FF): ñ, é, ü", () => {
  // "ñ" = U+00F1 = 0xC3 0xB1 (2 bytes, 1 JS char)
  const s = "aña"; // bytes: a(1) ñ(2) a(1) → offsets 0,1,3,4
  assert.equal(utf8ByteToCharIndex(s, 0), 0); // before 'a'
  assert.equal(utf8ByteToCharIndex(s, 1), 1); // before 'ñ'
  assert.equal(utf8ByteToCharIndex(s, 3), 2); // after 'ñ', before 'a'
  assert.equal(utf8ByteToCharIndex(s, 4), 3); // end
});

test("3-byte codepoints (U+0800–U+FFFF): Japanese", () => {
  // "日" = U+65E5 = 3 bytes, 1 JS char
  const s = "日本"; // bytes: 日(3) 本(3) → offsets 0,3,6
  assert.equal(utf8ByteToCharIndex(s, 0), 0);
  assert.equal(utf8ByteToCharIndex(s, 3), 1);
  assert.equal(utf8ByteToCharIndex(s, 6), 2);
});

test("4-byte codepoints (U+10000+): emoji as surrogate pair", () => {
  // "😀" = U+1F600 = 4 bytes, 2 JS chars (surrogate pair)
  const s = "a😀b"; // bytes: a(1) 😀(4) b(1) → offsets 0,1,5,6
  assert.equal(utf8ByteToCharIndex(s, 0), 0); // before 'a'
  assert.equal(utf8ByteToCharIndex(s, 1), 1); // before '😀'
  assert.equal(utf8ByteToCharIndex(s, 5), 3); // after '😀' (2 JS chars), before 'b'
  assert.equal(utf8ByteToCharIndex(s, 6), 4); // end
});

test("byte offset at exactly the string end", () => {
  assert.equal(utf8ByteToCharIndex("abc", 3), 3);
  assert.equal(utf8ByteToCharIndex("日", 3), 1);
});

test("byte offset 0 always gives char index 0", () => {
  for (const s of ["", "a", "ñ", "日", "😀"]) {
    assert.equal(utf8ByteToCharIndex(s, 0), 0, s);
  }
});

test("overshoot clamps to string length", () => {
  assert.equal(utf8ByteToCharIndex("hi", 999), 2);
});

// --- highlightSegments ---

test("no submatches: single unhighlighted segment", () => {
  assert.deepEqual(highlightSegments("  hello world", []), [
    { text: "hello world", highlight: false },
  ]);
});

test("single submatch covering the whole trimmed line", () => {
  const segs = highlightSegments("hello", [{ start: 0, end: 5 }]);
  assert.deepEqual(segs, [{ text: "hello", highlight: true }]);
});

test("submatch in the middle: prefix + highlight + suffix", () => {
  // "foo bar baz", match "bar" = bytes 4–7
  const segs = highlightSegments("foo bar baz", [{ start: 4, end: 7 }]);
  assert.deepEqual(segs, [
    { text: "foo ", highlight: false },
    { text: "bar", highlight: true },
    { text: " baz", highlight: false },
  ]);
});

test("leading whitespace is stripped; byte offsets are adjusted", () => {
  // "  hello" → trimmed "hello"; 'llo' at chars 2–5, bytes 2–5 (ASCII)
  const segs = highlightSegments("  hello", [{ start: 2, end: 5 }]);
  // sub.start(2) - leadingBytes(2) = 0; sub.end(5) - leadingBytes(2) = 3 → "hel"
  assert.deepEqual(segs, [
    { text: "hel", highlight: true },
    { text: "lo", highlight: false },
  ]);
});

test("multi-byte match: UTF-8 offsets translate to correct JS slice", () => {
  // "aña" bytes: a(1) ñ(2) a(1). Match 'ña' = bytes 1–4.
  const segs = highlightSegments("aña", [{ start: 1, end: 4 }]);
  assert.deepEqual(segs, [
    { text: "a",  highlight: false },
    { text: "ña", highlight: true },
  ]);
});

test("emoji match: surrogate-pair codepoint stays intact in the highlight", () => {
  // "a😀b" bytes: a(1) 😀(4) b(1). Match just '😀' = bytes 1–5.
  const segs = highlightSegments("a😀b", [{ start: 1, end: 5 }]);
  assert.deepEqual(segs, [
    { text: "a",  highlight: false },
    { text: "😀", highlight: true },
    { text: "b",  highlight: false },
  ]);
});

test("two non-adjacent submatches produce correct interleaved segments", () => {
  // "one two three", match "one"(0–3) and "three"(8–13)
  const segs = highlightSegments("one two three", [
    { start: 0, end: 3 },
    { start: 8, end: 13 },
  ]);
  assert.deepEqual(segs, [
    { text: "one",   highlight: true },
    { text: " two ", highlight: false },
    { text: "three", highlight: true },
  ]);
});
