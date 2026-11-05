// parity:diff.file-render:data
// Conductor renders diffs with Pierre's diff library (@pierre/diffs): its
// bundle carries the library's CodeView, Virtualizer and Shiki worker pool,
// and the diff tab passes the options below (REA, renderApp chunk of 0.87.6).
// Our backend returns parsed hunks, so they are turned back into a git patch
// for Pierre to parse, and into full file contents for expanding gaps.
import type { AnnotationSide, FileContents } from "@pierre/diffs";
import type { CommentSide } from "./comments.ts";
import type { DiffLine, FileDiff } from "./types.ts";

/** Pierre themes Conductor defaults to (`{dark:"pierre-dark",light:"pierre-light"}` in its bundle). */
export const PIERRE_THEME = { dark: "pierre-dark", light: "pierre-light" } as const;
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
