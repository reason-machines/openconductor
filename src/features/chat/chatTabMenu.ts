// parity:chat.tabs:menu
// A chat tab's right-click menu, as Conductor 0.87.6 builds it (REA-read
// renderApp-D_fmY7hW.js, the session tab `u8i` @7,374,777; its menu @7,377,893,
// `min-w-[200px]`):
//
//   Mark as read / Mark as unread
//   Rename chat                      (when the chat can be renamed)
//   Fork to new tab        ⌘⌥↩       (renamable, not archived, Experimental › "Fork chat to new tab")
//   ───
//   Copy concise transcript ⌘⌥C
//   Copy full transcript
//   Copy link
//   ───                              (Conductor's internal "Copy session info" is staff-only: left out)
//   Close tab               ⌘W       (when the tab can close)
//   Close others                     (disabled when the workspace has no other chat)
//
// Conductor shows the close pair together under `showClose`. OpenConductor's
// workspace chat has no close button, so its menu keeps "Close others" (which
// closes the other chat tabs) but not "Close tab".
//
// Pure: no React, no Tauri.

export type ChatTabAction = "toggle-read" | "rename" | "fork" | "copy-concise" | "copy-complete" | "copy-link" | "close" | "close-others";

export type ChatTabMenuEntry = { kind: "item"; id: ChatTabAction; label: string; shortcut?: string; disabled?: boolean } | { kind: "separator" };

export interface ChatTabMenuInput {
  unread: boolean;
  /** Conductor's `canRename`: the workspace is writable and not archived. */
  canRename: boolean;
  /** The workspace is archived (no fork). */
  archived: boolean;
  /** Experimental › "Fork chat to new tab" (`experimental_fork_to_new_tab`). */
  forkEnabled: boolean;
  /** A fork is being made (Conductor disables the item while its mutation runs). */
  forking: boolean;
  /** The tab has a close button. */
  closable: boolean;
  /** The workspace has a chat tab besides this one (Conductor's `hasOtherSessions`). */
  hasOtherTabs: boolean;
}

/** Conductor's `J4` shortcut hints on the menu. */
export const FORK_SHORTCUT = "⌘⌥↩";
export const COPY_CONCISE_SHORTCUT = "⌘⌥C";
export const CLOSE_TAB_SHORTCUT = "⌘W";

/** The menu's rows, top to bottom. */
export function chatTabMenu(i: ChatTabMenuInput): ChatTabMenuEntry[] {
  const out: ChatTabMenuEntry[] = [{ kind: "item", id: "toggle-read", label: i.unread ? "Mark as read" : "Mark as unread" }];
  if (i.canRename) out.push({ kind: "item", id: "rename", label: "Rename chat" });
  if (i.canRename && !i.archived && i.forkEnabled) out.push({ kind: "item", id: "fork", label: "Fork to new tab", shortcut: FORK_SHORTCUT, disabled: i.forking });
  out.push(
    { kind: "separator" },
    { kind: "item", id: "copy-concise", label: "Copy concise transcript", shortcut: COPY_CONCISE_SHORTCUT },
    { kind: "item", id: "copy-complete", label: "Copy full transcript" },
    { kind: "item", id: "copy-link", label: "Copy link" },
    { kind: "separator" },
  );
  if (i.closable) out.push({ kind: "item", id: "close", label: "Close tab", shortcut: CLOSE_TAB_SHORTCUT });
  out.push({ kind: "item", id: "close-others", label: "Close others", disabled: !i.hasOtherTabs });
  return out;
}

/** The Rename chat dialog's outcome for what was typed (Conductor's `Rya` submit): an empty or unchanged name just closes. */
export function renamedChatTitle(current: string, typed: string): string | null {
  const title = typed.trim();
  return !title || title === current ? null : title;
}

/** The toasts the copy items show (Conductor's `U`, `XV`). */
export const NO_CHAT_CONTENT = "No chat content to copy";
export const copyTranscriptFailed = (kind: "concise" | "complete") => `Failed to copy ${kind} transcript`;
