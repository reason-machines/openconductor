// parity:diff.navigation:ui
// Next/previous file and next/previous comment, wrapping at the ends.
import type { CommentSide, DiffComment } from "./comments.ts";
import type { FileDiff } from "./types.ts";

export function step(index: number, count: number, dir: 1 | -1): number {
  if (count === 0) return -1;
  if (index < 0) return dir === 1 ? 0 : count - 1;
  return (index + dir + count) % count;
}

/** First unviewed file after `index`, wrapping; -1 when every file is viewed. */
export function nextUnread(index: number, count: number, viewedAt: (i: number) => boolean): number {
  for (let k = 1; k <= count; k++) {
    const i = (Math.max(index, -1) + k + count) % count;
    if (!viewedAt(i)) return i;
  }
  return -1;
}

export interface CommentTarget {
  id: string;
  fileIndex: number;
  line: number;
}

/** Comment roots in reading order: by file position in the diff, then by line. */
export function commentTargets(comments: DiffComment[], files: FileDiff[]): CommentTarget[] {
  const order = new Map(files.map((f, i) => [f.path, i]));
  return comments
    .filter((c) => !c.reply_to_comment_id && order.has(c.file_path))
    .map((c) => ({ id: c.id, fileIndex: order.get(c.file_path)!, line: c.end_line_number ?? c.line_number }))
    .sort((a, b) => a.fileIndex - b.fileIndex || a.line - b.line);
}

/**
 * Where the reading line sits below the top of the diff, in px: comments are
 * scrolled to this offset, and one above it counts as "previous". Conductor's value.
 */
export const COMMENT_SCROLL_OFFSET = 56;

/** A comment's position in the diff's scroll content. */
export interface MeasuredComment<T> {
  target: T;
  top: number;
  height: number;
}

export interface CommentWindow<T> {
  previous?: T;
  next?: T;
  /** Comments above the visible ones (or above the reading line when none is visible). */
  previousCount: number;
  /** Comments below the visible ones. */
  nextCount: number;
}

/**
 * The comments before and after what is on screen, for the floating Previous
 * and Next comment buttons. Visible comments count in neither direction; when
 * none is visible, those at or above the reading line are "previous".
 * Same rules as Conductor's diff tab (evidence/diff/comment-navigation.md).
 */
export function commentWindow<T>(measured: readonly MeasuredComment<T>[], scrollTop: number, viewportHeight: number): CommentWindow<T> {
  if (measured.length === 0) return { previousCount: 0, nextCount: 0 };
  const sorted = [...measured].sort((a, b) => a.top - b.top);
  const reading = scrollTop + COMMENT_SCROLL_OFFSET;
  const bottom = scrollTop + viewportHeight;
  const visible = (m: MeasuredComment<T>) => m.top + m.height > reading && m.top < bottom;
  const first = sorted.findIndex(visible);
  if (first !== -1) {
    let last = first;
    while (last + 1 < sorted.length && sorted[last + 1].top < bottom) last++;
    return { previous: sorted[first - 1]?.target, next: sorted[last + 1]?.target, previousCount: first, nextCount: sorted.length - last - 1 };
  }
  let above = -1;
  while (above + 1 < sorted.length && sorted[above + 1].top <= reading) above++;
  return { previous: sorted[above]?.target, next: sorted[above + 1]?.target, previousCount: above + 1, nextCount: sorted.length - above - 1 };
}

export function stepComment(targets: CommentTarget[], currentId: string | null, dir: 1 | -1): CommentTarget | null {
  const i = targets.findIndex((t) => t.id === currentId);
  const next = step(i, targets.length, dir);
  return next < 0 ? null : targets[next];
}

/** The parts of Pierre's CodeView that comment navigation reads (structural, so tests can fake it). */
export interface MeasurableView {
  getTopForItem(id: string): number | undefined;
  getRenderedItems(): ReadonlyArray<{
    id: string;
    type: "diff" | "file";
    instance: { getLinePosition(line: number, side?: "deletions" | "additions"): { top: number; height: number } | undefined };
  }>;
  getContainerElement(): { scrollTop: number; clientHeight: number } | undefined;
}

/**
 * Comment anchors of CodeView item `itemId`, measured in the view's scroll
 * content (deduplicated by side and line), as a CommentWindow.
 */
export function measureComments<A extends { side: CommentSide; line: number }>(
  view: MeasurableView,
  itemId: string,
  anchors: readonly A[],
  scrollTop?: number,
): CommentWindow<A> {
  const itemTop = view.getTopForItem(itemId);
  const item = view.getRenderedItems().find((i) => i.id === itemId);
  if (itemTop === undefined || !item) return { previousCount: 0, nextCount: 0 };
  const container = view.getContainerElement();
  const seen = new Set<string>();
  const measured: MeasuredComment<A>[] = [];
  for (const a of anchors) {
    const key = `${a.side}:${a.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pos = item.type === "diff" ? item.instance.getLinePosition(a.line, a.side === "old" ? "deletions" : "additions") : item.instance.getLinePosition(a.line);
    if (pos) measured.push({ target: a, top: itemTop + pos.top, height: pos.height });
  }
  return commentWindow(measured, scrollTop ?? container?.scrollTop ?? 0, container?.clientHeight ?? 0);
}
