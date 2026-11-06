// parity:diff.copy-file:logic
// The diff file header's "Copy file contents" button (Conductor 0.87.6, read
// from renderApp-D_fmY7hW.js: the header action `zPo`, its copy source built in
// `GPo`, the `SimpleCopyButton` `t0` and the clipboard writer `H$r`).
// - Shown for files that are not deleted, not binary and of text type (`W9e`:
//   not an image, video or PDF by extension).
// - Copies the file as it is now: the editor's draft when the entire-file view
//   is being edited, else the whole new file loaded on click.
// - Writes plain text plus an HTML `<pre data-conductor-clipboard="…">` that
//   names the path, so a paste into a composer can attach it as that file.
import { fullContents } from "./pierre.ts";
import type { FileDiff } from "./types.ts";

// `ile` and `oLt` in index-BGEQ8YjU.js (images and videos the viewer previews).
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff", "avif", "bmp"]);
const VIDEO_EXT = new Set(["mp4", "m4v", "mov", "webm", "ogv"]);

/** Conductor's `W9e(path) === "text"`: anything that is not an image, a video or a PDF. */
export function isTextPath(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return !IMAGE_EXT.has(ext) && !VIDEO_EXT.has(ext) && ext !== "pdf";
}

/**
 * What the copy button copies for `file`, or null when the header has no copy
 * button. `draft` is the entire-file editor's text; `loadText` loads the whole
 * new file. A file with no hunks (a pure rename or mode change) has no text a
 * diff can give, so it gets no button rather than an empty copy.
 */
export function copySource(file: FileDiff, from: { draft?: () => string; loadText?: () => Promise<string> }): (() => Promise<string>) | null {
  if (file.status === "deleted" || file.binary || !isTextPath(file.path)) return null;
  const { draft, loadText } = from;
  if (draft) return async () => draft();
  if (loadText && file.hunks.length > 0) return loadText;
  return null;
}

/** The new file's text from a whole-file-context diff of it. */
export function newFileText(full: FileDiff): string {
  const text = fullContents(full).new;
  if (text === null) throw new Error("The new file contents are unavailable");
  return text;
}

/** Conductor's clipboard marker attribute (`S8t`) and its payload (`M$r`). */
export const CLIPBOARD_ATTR = "data-conductor-clipboard";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `j$r`: the HTML flavour, a `<pre>` holding the escaped text and the encoded payload. */
export function clipboardHtml(path: string, contents: string): string {
  const payload = { schemaVersion: 1, kind: "file-contents", path };
  return `<pre ${CLIPBOARD_ATTR}="${encodeURIComponent(JSON.stringify(payload))}">${escapeHtml(contents)}</pre>`;
}

/** How long the button shows its check and "Copied!" after a copy (`t0`: 2e3). */
export const COPIED_MS = 2000;
