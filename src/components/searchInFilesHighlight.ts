// Pure highlight helpers for SearchInFilesDialog, extracted so they can be
// unit-tested without a DOM/React environment.
//
// REA evidence: renderApp-D_fmY7hW.js offsets 7427975–7435900 (function Yco).
// Rust ripgrep returns UTF-8 byte offsets; JS string slices by UTF-16 code
// units, so a straight index comparison breaks on any multi-byte codepoint in
// the match line.

/** Submatch byte range from a GrepMatch (Conductor `submatches` field). */
export interface Submatch {
  start: number; // UTF-8 byte offset in line_text (inclusive)
  end: number;   // UTF-8 byte offset in line_text (exclusive)
}

/**
 * Convert a UTF-8 byte offset within `str` to a JavaScript (UTF-16) string
 * index.  Callers must ensure `byteOffset` ≤ the total UTF-8 byte length of
 * `str`; if it overshoots, the string's length is returned.
 *
 * UTF-8 widths:
 *   U+0000–U+007F   → 1 byte, 1 JS code unit
 *   U+0080–U+07FF   → 2 bytes, 1 JS code unit
 *   U+0800–U+FFFF   → 3 bytes, 1 JS code unit
 *   U+10000+        → 4 bytes, 2 JS code units (surrogate pair)
 */
export function utf8ByteToCharIndex(str: string, byteOffset: number): number {
  let idx = 0;
  let bytes = 0;
  while (idx < str.length && bytes < byteOffset) {
    const cp = str.codePointAt(idx)!;
    bytes += cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4;
    idx += cp > 0xffff ? 2 : 1; // surrogate pair = 2 UTF-16 code units
  }
  return idx;
}

/**
 * Split a grep match line into plain-text and highlighted segments, returning
 * an array of `{ text, highlight }` pairs.
 *
 * `submatches` are UTF-8 byte ranges within `lineText`.  Leading whitespace is
 * always ASCII (tab or space), so its byte count equals its char count.
 */
export interface Segment {
  text: string;
  highlight: boolean;
}

export function highlightSegments(lineText: string, submatches: Submatch[]): Segment[] {
  const trimmed = lineText.trimStart();
  // Leading whitespace is ASCII-only: char count === byte count.
  const leadingBytes = lineText.length - trimmed.length;
  const segments: Segment[] = [];
  let cursor = 0;
  for (const sub of submatches) {
    const start = utf8ByteToCharIndex(trimmed, Math.max(sub.start - leadingBytes, 0));
    const end   = utf8ByteToCharIndex(trimmed, Math.max(sub.end   - leadingBytes, 0));
    if (start > cursor) segments.push({ text: trimmed.slice(cursor, start), highlight: false });
    segments.push({ text: trimmed.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < trimmed.length) segments.push({ text: trimmed.slice(cursor), highlight: false });
  return segments;
}
