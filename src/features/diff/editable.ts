// parity:diff.edit-in-viewer:ui
// Which files the diff viewer can edit, and the text it starts from (EditInViewer.ts).
import { fullContents } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

/** Text to edit, only after the layout's whole-file-context load has completed. */
export function editableContents(file: FileDiff, layout: DiffLayout, ignoreWhitespace: boolean, full: FileDiff | null = null): string | null {
  if (file.binary || file.status === "deleted" || file.hunks.length === 0) return null;
  const complete = layout === "file" && !ignoreWhitespace ? file : full;
  if (!complete || complete.path !== file.path || complete.binary || complete.status === "deleted" || complete.hunks.length === 0) return null;
  return fullContents(complete).new;
}
