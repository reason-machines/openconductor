// parity:diff.edit-in-viewer:ui parity:diff.edit-in-viewer:preview
// Which files the diff viewer can edit, and the text it starts from (EditInViewer.ts).
// isPreviewablePath: Conductor shows a rendered preview in the file (whole-file) layout
// for markdown and HTML files (bji's isPreviewing flag; workspace.toggleFileEdit ⌘E switches
// between source and preview).
import { fullContents } from "./pierre.ts";
import type { DiffLayout, FileDiff } from "./types.ts";

const PREVIEW_EXT = new Set(["md", "markdown", "html", "htm"]);

/** Conductor's isPreviewing gate: markdown and HTML files get a rendered preview in file layout. */
export function isPreviewablePath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEW_EXT.has(ext);
}

/** Text to edit, only after the layout's whole-file-context load has completed. */
export function editableContents(file: FileDiff, layout: DiffLayout, ignoreWhitespace: boolean, full: FileDiff | null = null): string | null {
  if (file.binary || file.status === "deleted" || file.hunks.length === 0) return null;
  const complete = layout === "file" && !ignoreWhitespace ? file : full;
  if (!complete || complete.path !== file.path || complete.binary || complete.status === "deleted" || complete.hunks.length === 0) return null;
  return fullContents(complete).new;
}
