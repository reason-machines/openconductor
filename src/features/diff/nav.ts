// parity:diff.navigation:ui
// Next/previous file and next/previous comment, wrapping at the ends.
import type { DiffComment } from "./comments.ts";
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

export function stepComment(targets: CommentTarget[], currentId: string | null, dir: 1 | -1): CommentTarget | null {
  const i = targets.findIndex((t) => t.id === currentId);
  const next = step(i, targets.length, dir);
  return next < 0 ? null : targets[next];
}
