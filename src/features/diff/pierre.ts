// parity:diff.file-render:data
// Conductor renders diffs with Pierre's diff library (@pierre/diffs): its
// bundle carries the library's CodeView, Virtualizer and Shiki worker pool,
// and the diff tab passes the options below (REA, renderApp chunk of 0.87.6).
// Our backend returns parsed hunks, so they are turned back into a git patch
// for Pierre to parse, and into full file contents for expanding gaps (or,
// in the diff tab, for a diff Pierre computes from the whole old and new files).
import { parseDiffFromFile, type AnnotationSide, type CodeViewItem, type CodeViewLineScrollTarget, type FileContents, type FileDiffMetadata, type SelectedLineRange } from "@pierre/diffs";
import type { CommentSide } from "./comments.ts";
import type { DiffLayout, DiffLine, FileDiff } from "./types.ts";

/** Pierre's own default themes (`Lp` in Conductor's bundle); Conductor replaces them with its own (conductorCodeTheme.ts). */
export const PIERRE_THEME = { dark: "pierre-dark", light: "pierre-light" } as const;
/** Spacing Conductor's diff tab gives its CodeView: no top padding, 8 px below and between items. */
export const CODE_VIEW_LAYOUT = { paddingTop: 0, paddingBottom: 8, gap: 8 } as const;
/** Lines one click on an "N unmodified lines" row reveals in Conductor's diff tab. */
export const EXPANSION_LINE_COUNT = 20;

const DEV_NULL = "/dev/null";

/** The file as a git patch: header, then each hunk with its lines. */
export function toPatch(file: FileDiff): string {
  const oldPath = file.old_path ?? file.path;
  const from = file.status === "added" || file.status === "untracked" ? DEV_NULL : `a/${oldPath}`;
  const to = file.status === "deleted" ? DEV_NULL : `b/${file.path}`;
  const out = [`diff --git a/${oldPath} b/${file.path}`];
  if (file.status === "added" || file.status === "untracked") out.push("new file mode 100644");
  if (file.status === "deleted") out.push("deleted file mode 100644");
  // Pierre reads a rename only from a similarity line; it tells 100% (pure rename) from anything less.
  if (file.old_path && file.old_path !== file.path)
    out.push(`similarity index ${file.hunks.length === 0 ? 100 : 99}%`, `rename from ${file.old_path}`, `rename to ${file.path}`);
  if (file.hunks.length > 0) out.push(`--- ${from}`, `+++ ${to}`);
  for (const h of file.hunks) {
    out.push(`@@ -${h.old_start},${h.old_lines} +${h.new_start},${h.new_lines} @@${h.section ? ` ${h.section}` : ""}`);
    for (const l of h.lines) {
      out.push(`${l.kind === "addition" ? "+" : l.kind === "deletion" ? "-" : " "}${l.text}`);
      if (l.no_newline_at_eof) out.push("\\ No newline at end of file");
    }
  }
  return `${out.join("\n")}\n`;
}

function join(lines: DiffLine[]): string {
  if (lines.length === 0) return "";
  const text = lines.map((l) => l.text).join("\n");
  return lines[lines.length - 1].no_newline_at_eof ? text : `${text}\n`;
}

/**
 * Old and new contents of a file loaded with whole-file context (one hunk
 * covering it all): context and deleted lines make the old file, context and
 * added lines the new one. Null for a side that does not exist.
 */
export function fullContents(file: FileDiff): { old: string | null; new: string | null } {
  const lines = file.hunks.flatMap((h) => h.lines);
  const created = file.status === "added" || file.status === "untracked";
  return {
    old: created ? null : join(lines.filter((l) => l.kind !== "addition")),
    new: file.status === "deleted" ? null : join(lines.filter((l) => l.kind !== "deletion")),
  };
}

/**
 * Pierre's diff of a file loaded with whole-file context, from its old and new
 * contents rather than a patch, so it is not partial: Pierre knows where the file
 * ends and counts the unmodified lines on both sides of each change, with no
 * "More unchanged context may be available" row after the last one. Conductor's
 * diff tab does the same for a local text file (REA, renderApp 0.87.6: `Gri` with
 * preferPatchForRemoteDiffs false, then `BVo` parses old and new with `iI`).
 */
export function fullDiffMeta(full: FileDiff, ignoreWhitespace: boolean): FileDiffMetadata {
  const c = fullContents(full);
  return parseDiffFromFile(
    c.old === null ? null : { name: full.old_path ?? full.path, contents: c.old },
    c.new === null ? null : { name: full.path, contents: c.new },
    ignoreWhitespace ? { ignoreWhitespace: true } : undefined,
  );
}

/** What Pierre's `loadDiffFiles` resolves to, from a whole-file-context load. */
export function loadedFiles(file: FileDiff): { oldFile: FileContents; newFile: FileContents } {
  const c = fullContents(file);
  return {
    oldFile: { name: file.old_path ?? file.path, contents: c.old ?? "" },
    newFile: { name: file.path, contents: c.new ?? "" },
  };
}

export const toPierreSide = (side: CommentSide): AnnotationSide => (side === "old" ? "deletions" : "additions");
export const fromPierreSide = (side: AnnotationSide | undefined): CommentSide => (side === "deletions" ? "old" : "new");

/**
 * The file as the single item of the diff tab's CodeView (Conductor builds the
 * same one-item list): its diff, or for the entire-file layout the file as it
 * is now (as it was, for a deleted file). Anchored lines become annotations.
 */
/** A line something is rendered under (a comment thread, the composer). */
export interface Anchor {
  side: CommentSide;
  line: number;
  commentIds?: string[];
}

/**
 * Lines picked for a new comment: `start` to `line` on `side`. The composer
 * sits under `line`, the range's last line, where the thread will show.
 */
export interface LineRange extends Anchor {
  start: number;
}

/**
 * The comment range for a Pierre line selection or gutter click, as Conductor
 * builds it: the lower line first, the side where the selection started.
 */
export function rangeOf(r: SelectedLineRange, side: CommentSide): LineRange {
  return { side, start: Math.min(r.start, r.end), line: Math.max(r.start, r.end) };
}

/** Pierre's selection for a comment range, so the picked lines stay highlighted while it is composed. */
export function selectionOf(range: LineRange, wholeFile: boolean): SelectedLineRange {
  const side = wholeFile ? undefined : toPierreSide(range.side);
  return { start: range.start, end: range.line, ...(side ? { side, endSide: side } : {}) };
}

export function codeViewItem(file: FileDiff, meta: FileDiffMetadata | undefined, layout: DiffLayout, anchors: Anchor[], version: number): CodeViewItem<Anchor> {
  if (layout === "file" || !meta) {
    const c = fullContents(file);
    const side: CommentSide = c.new === null ? "old" : "new";
    return {
      id: file.path,
      type: "file",
      file: { name: file.path, contents: c.new ?? c.old ?? "" },
      annotations: anchors.filter((a) => a.side === side).map((a) => ({ lineNumber: a.line, metadata: a })),
      version,
    };
  }
  return {
    id: file.path,
    type: "diff",
    fileDiff: meta,
    annotations: anchors.map((a) => ({ side: toPierreSide(a.side), lineNumber: a.line, metadata: a })),
    version,
  };
}

/** Seed Pierre's edit session from the full draft, retaining the old side and annotations. */
export function editableCodeViewItem<A>(item: CodeViewItem<A>, contents: string, ignoreWhitespace = false): CodeViewItem<A> {
  if (item.type === "file") return { ...item, file: { ...item.file, contents }, edit: true };
  const meta = item.fileDiff;
  if (meta.isPartial) return item;
  return {
    ...item,
    edit: true,
    fileDiff: parseDiffFromFile(
      meta.type === "new" ? null : { name: meta.prevName ?? meta.name, contents: meta.deletionLines.join("") },
      { name: meta.name, contents },
      ignoreWhitespace ? { ignoreWhitespace: true } : undefined,
    ),
  };
}

/** Where CodeView scrolls to show an anchored line, centred, in the item of `path`. */
export function lineTarget(path: string, anchor: Anchor, wholeFile: boolean): CodeViewLineScrollTarget {
  return { type: "line", id: path, lineNumber: anchor.line, ...(wholeFile ? {} : { side: toPierreSide(anchor.side) }), align: "center" };
}
