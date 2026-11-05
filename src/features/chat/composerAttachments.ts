// parity:chat.attachments:data
// Files the user attaches in the composer (the attach button, ⌘U, paste or
// drop). As in Conductor (evidence/persistence/draft-attachments/README.md):
// a picked file is staged under the app data folder
// (`draft-attachments/<workspace>/<random 6>/<name>`) and, when the message is
// sent, copied into the workspace as `.context/attachments/<random 6>/<name>`,
// so the agent can open it there. Removing a chip before sending deletes the
// staged copy and leaves the workspace alone.
//
// The agent gets each file as an embedded file named by that workspace path:
// its text for a text file, else a note that says where the file is.
//
// Not read from Conductor: its file-name sanitizer (`tvt`); the rule below is
// our own. Pure: no Tauri, no React.

import { ATTACHMENTS_DIR } from "../draft-attachments/staging.ts";
import type { TextAttachment } from "../diff/chatAttachment.ts";

/** Largest file the composer takes. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Largest text sent inline; a bigger file is only pointed at. */
export const MAX_INLINE_TEXT_BYTES = 512 * 1024;

/** An attachment waiting in the composer. */
export interface ComposerAttachment extends TextAttachment {
  /** Shown on the chip; `name` when absent. */
  label?: string;
  /** A staged file: its workspace-relative path (`.context/attachments/…`), which is also its `name`. */
  staged?: string;
}

/** A file name safe as one path component: no separators, control characters or leading dots. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f:*?"<>|]/g, "-")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "attachment";
}

/** Six random lowercase letters and digits, Conductor's per-attachment folder. */
export function randomDir(random: () => number = Math.random): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(random() * chars.length)]).join("");
}

/** Where an attached file goes in the workspace. */
export function attachmentPath(fileName: string, dir: string): string {
  return `${ATTACHMENTS_DIR}/${dir}/${safeFileName(fileName)}`;
}

/** The file's text when it is UTF-8 text small enough to send inline, else null. */
export function inlineText(bytes: Uint8Array): string | null {
  if (bytes.length > MAX_INLINE_TEXT_BYTES || bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** What the agent receives for a staged file: its text, or where to find it. */
export function promptText(bytes: Uint8Array, relativePath: string): string {
  return inlineText(bytes) ?? `The user attached a file that is not shown here (${bytes.length} bytes). It is in the workspace at ${relativePath}.`;
}

/** Why a file cannot be attached, or null. */
export function rejectReason(file: { name: string; size: number }): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name} is larger than ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`;
  return null;
}
