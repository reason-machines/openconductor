// parity:diff.edit-in-viewer:ui
// Which files the diff viewer can edit, and the text it starts from (EditInViewer.ts).
import { fullContents } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

/** Text to edit, only after the layout's whole-file-context load has completed. */
export function editableContents(file: FileDiff, layout: DiffLayout, ignoreWhitespace: boolean, full: FileDiff | null = null): string | null {
  // A -w diff prints whitespace-only changes as context, so its text is not the file's.
  if (ignoreWhitespace || file.binary || file.status === "deleted" || file.hunks.length === 0) return null;
  const complete = layout === "file" ? file : full;
  if (!complete || complete.path !== file.path || complete.binary || complete.status === "deleted") return null;
  return fullContents(complete).new;
}
