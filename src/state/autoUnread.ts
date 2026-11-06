// parity:sidebar.ws-unread
// Unread that the app sets and clears by itself, as Conductor does.
//
// Set: a chat that wants attention (features/chat/attention.ts) is marked
// unread unless it is in view. Conductor's test is `isSessionInView`
// (index-BGEQ8YjU.js @3,033,010): the chat is the open tab of the open
// workspace (`U2` @3,139,820 reads the route) and the app window has focus
// (`QW` @2,541,964 is `sessionSelected && isFocused`).
//
// Clear: an unread chat that is shown while the window has focus is marked
// read (renderApp-D_fmY7hW.js `yIo` @8,716,730), unless the user marked it
// unread by hand while looking at it. That hand mark lasts until the chat is
// opened again (`manuallyUnreadSessions`, `clearManuallyUnread` @7,271,963).
//
// Unread lives on the workspace here (`workspaces.unread`), so a chat's mark
// lands on its workspace; Conductor keeps it per chat (`sessions.unread_count`).
import { workspaceOfChat } from "./workspaceSessions.ts";

/** The chat whose transcript the open workspace shows; null for the diff or PR tab, or no workspace. */
let shown: string | null = null;

export function setShownChat(chatId: string | null): void {
  shown = chatId;
}

export function shownChat(): string | null {
  return shown;
}

/** Conductor's `QW`: the chat is on screen and the window has focus. */
export function chatInView(chatId: string, view: { shownChatId: string | null; focused: boolean }): boolean {
  return view.focused && view.shownChatId === chatId;
}

/** The workspace an attention signal from `chatId` marks unread, or null when the user is looking at the chat. */
export function unreadTarget(chatId: string, view: { shownChatId: string | null; focused: boolean }): string | null {
  return chatInView(chatId, view) ? null : workspaceOfChat(chatId);
}

const manual = new Set<string>();

/** The user marked the workspace unread (row menu or R): showing it does not clear the mark. */
export function markManuallyUnread(workspaceId: string): void {
  manual.add(workspaceId);
}

/** The workspace was opened (again): the next look at it clears unread. */
export function clearManuallyUnread(workspaceId: string): void {
  manual.delete(workspaceId);
}

/** `yIo`: an unread workspace whose chat is shown with the window focused is read now. */
export function readOnView(workspace: { id: string; unread?: boolean }, view: { shownChatId: string | null; focused: boolean }): boolean {
  return !!workspace.unread && view.focused && view.shownChatId !== null && workspaceOfChat(view.shownChatId) === workspace.id && !manual.has(workspace.id);
}
