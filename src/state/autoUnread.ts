// parity:sidebar.ws-unread
// Unread that the app sets and clears by itself, per chat, as Conductor does.
//
// Set: a chat that wants attention (features/chat/attention.ts) is marked
// unread unless it is in view. Conductor's test is `isSessionInView`
// (index-BGEQ8YjU.js @3,033,010): the chat is the open tab of the open
// workspace (`U2` @3,139,820 reads the route) and the app window has focus
// (`QW` @2,541,964 is `sessionSelected && isFocused`).
//
// Clear: an unread chat that is shown while the window has focus is marked
// read (renderApp-D_fmY7hW.js `yIo` @8,716,730), unless the user marked that
// chat unread by hand. The hand mark lasts until the chat is shown again
// (`manuallyUnreadSessions`, `clearManuallyUnread` @7,271,963); the row's
// "Mark as read" drops the workspace's marks (`clearManuallyUnreadForWorkspace`).
import { isChatUnread } from "./chatUnread.ts";
import { chatOpenable } from "./openChat.ts";
import type { UnreadChat } from "./types.ts";
import { workspaceOfChat } from "./workspaceSessions.ts";

/** The chat whose transcript the open workspace shows; null for the diff or PR tab, or no workspace. */
let shown: string | null = null;
/** The open workspace's chat tab (kept while the diff or PR tab is in front): Conductor's selected session. */
let selected: string | null = null;

export function setShownChat(chatId: string | null): void {
  shown = chatId;
}

export function shownChat(): string | null {
  return shown;
}

export function setSelectedChat(chatId: string | null): void {
  selected = chatId;
}

/** The selected chat of `workspaceId`: its open chat tab when it is the open workspace, else its main chat. */
export function selectedChatOf(workspaceId: string): string {
  return selected !== null && workspaceOfChat(selected) === workspaceId ? selected : workspaceId;
}

type View = { shownChatId: string | null; focused: boolean };

/** Conductor's `QW`: the chat is on screen and the window has focus. */
export function chatInView(chatId: string, view: View): boolean {
  return view.focused && view.shownChatId === chatId;
}

/**
 * Where an attention signal from `chatId` lands: that chat, in its workspace;
 * null when the user is looking at it, or when it has no tab (a closed review
 * counts as hidden, which Conductor leaves out of the workspace's unread).
 */
export function unreadTarget(chatId: string, view: View): { workspaceId: string; chatId: string } | null {
  if (chatInView(chatId, view) || !chatOpenable(chatId)) return null;
  return { workspaceId: workspaceOfChat(chatId), chatId };
}

/** Chat id -> workspace id of chats the user marked unread by hand. */
const manual = new Map<string, string>();

/** The user marked the chat unread (row menu, R or the tab menu): showing it does not clear the mark. */
export function markManuallyUnread(chatId: string): void {
  manual.set(chatId, workspaceOfChat(chatId));
}

/** The chat was shown (again), or marked read from its tab: the next look at it clears unread. */
export function clearManuallyUnread(chatId: string): void {
  manual.delete(chatId);
}

/** The row's "Mark as read": every hand mark in the workspace goes. */
export function clearManuallyUnreadForWorkspace(workspaceId: string): void {
  for (const [chatId, ws] of manual) if (ws === workspaceId) manual.delete(chatId);
}

/** `yIo`: the chat of `workspace` to mark read now (shown, focused, unread, not marked by hand), or null. */
export function readOnView(workspace: { id: string; unreadChats?: readonly UnreadChat[] }, view: View): string | null {
  const chatId = view.shownChatId;
  if (!view.focused || chatId === null || workspaceOfChat(chatId) !== workspace.id) return null;
  return isChatUnread(workspace, chatId) && !manual.has(chatId) ? chatId : null;
}
