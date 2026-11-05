// parity:diff.edit-in-viewer:ui
// Which files the diff viewer can edit, and the text it starts from (EditInViewer.ts).
import { fullContents } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

/** Only text files with their whole contents loaded, and not deleted, can be edited. */
export function editableContents(file: FileDiff, layout: DiffLayout, ignoreWhitespace: boolean): string | null {
  // A -w diff prints whitespace-only changes as context, so its text is not the file's.
  if (layout !== "file" || ignoreWhitespace || file.binary || file.status === "deleted" || file.hunks.length === 0) return null;
  return fullContents(file).new;
}
