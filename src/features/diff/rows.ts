// parity:diff.split-unified:ui parity:diff.file-render:ui
// Turns hunks into render rows for the unified and split layouts, and finds
// the changed span inside a modified line so it can be emphasised.
import type { DiffLine, FileDiff, Hunk } from "./types.ts";

/** A [start, end) character range inside a line's text. */
export type Span = [number, number];

export interface UnifiedRow {
  line: DiffLine;
  emphasis?: Span;
}

export interface SplitRow {
  /** Old side: a context or deleted line, or null for padding. */
  left: DiffLine | null;
  /** New side: a context or added line, or null for padding. */
  right: DiffLine | null;
  leftEmphasis?: Span;
  rightEmphasis?: Span;
}

/** Changed region between two versions of a line: common prefix and suffix are trimmed. */
export function changedSpans(before: string, after: string): { before: Span; after: Span } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  // Emphasis is noise when nearly the whole line changed.
  const longest = Math.max(before.length, after.length);
  if (longest > 0 && start + (before.length - endB) < longest * 0.2) return null;
  return { before: [start, endB], after: [start, endA] };
}

/** Runs of deletions followed by additions, paired line by line. */
function changeBlocks(lines: DiffLine[]): Array<DiffLine | { dels: DiffLine[]; adds: DiffLine[] }> {
  const out: Array<DiffLine | { dels: DiffLine[]; adds: DiffLine[] }> = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].kind === "context") {
      out.push(lines[i++]);
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "deletion") dels.push(lines[i++]);
    while (i < lines.length && lines[i].kind === "addition") adds.push(lines[i++]);
    out.push({ dels, adds });
  }
  return out;
}

export function unifiedRows(hunk: Hunk): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  for (const block of changeBlocks(hunk.lines)) {
    if ("kind" in block) {
      rows.push({ line: block });
      continue;
    }
    const spans = block.dels.map((d, k) => (block.adds[k] ? changedSpans(d.text, block.adds[k].text) : null));
    block.dels.forEach((d, k) => rows.push({ line: d, emphasis: spans[k]?.before }));
    block.adds.forEach((a, k) => rows.push({ line: a, emphasis: spans[k]?.after }));
  }
  return rows;
}

export function splitRows(hunk: Hunk): SplitRow[] {
  const rows: SplitRow[] = [];
  for (const block of changeBlocks(hunk.lines)) {
    if ("kind" in block) {
      rows.push({ left: block, right: block });
      continue;
    }
    const n = Math.max(block.dels.length, block.adds.length);
    for (let k = 0; k < n; k++) {
      const left = block.dels[k] ?? null;
      const right = block.adds[k] ?? null;
      const spans = left && right ? changedSpans(left.text, right.text) : null;
      rows.push({ left, right, leftEmphasis: spans?.before, rightEmphasis: spans?.after });
    }
  }
  return rows;
}

/**
 * Unchanged lines hidden above hunk `i`: between the file start (or the previous
 * hunk's end) and where this hunk starts. Rendered as an "N unmodified lines" row.
 */
export function gapBefore(hunks: Hunk[], i: number): number {
  const h = hunks[i];
  if (i === 0) return Math.max(0, h.new_start - 1);
  const prev = hunks[i - 1];
  return Math.max(0, h.new_start - (prev.new_start + prev.new_lines));
}

/**
 * Entire-file view: the file as it is now (context and added lines), or as it
 * was for a deleted file. Load it with full context so no gaps remain.
 */
export function fileLines(file: FileDiff, hunk: Hunk): DiffLine[] {
  const drop = file.status === "deleted" ? "addition" : "deletion";
  return hunk.lines.filter((l) => l.kind !== drop);
}
