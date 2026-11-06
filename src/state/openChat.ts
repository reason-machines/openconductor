// parity:sidebar.ws-unread
// Which chats of a workspace can be shown, and requests to show one.
//
// A workspace's chats are its main chat (id = workspace id) and the review chats
// whose tabs are open (features/diff/ReviewButton.tsx reports them here). Go to
// next unread and a click on the selected row open a chat by id (Conductor
// navigates with the session's tab, renderApp `g1o` @7,528,638 and the row click
// @9,885,472); the workspace view takes the request when it shows that workspace.
import { workspaceOfChat } from "./workspaceSessions.ts";

const reviewChats = new Map<string, readonly string[]>();

/** The review chats with an open tab in the workspace, in strip order. */
export function setOpenReviewChats(workspaceId: string, chatIds: readonly string[]): void {
  if (chatIds.length > 0) reviewChats.set(workspaceId, chatIds);
  else reviewChats.delete(workspaceId);
}

/** The workspace's chats in tab order: its main chat, then open review chats. */
export function workspaceChats(workspaceId: string): string[] {
  return [workspaceId, ...(reviewChats.get(workspaceId) ?? [])];
}

/** The chat has a tab to show it in: the main chat always, a review chat while its tab is open. */
export function chatOpenable(chatId: string): boolean {
  const ws = workspaceOfChat(chatId);
  return ws === chatId || (reviewChats.get(ws)?.includes(chatId) ?? false);
}

const requests = new Map<string, string>();
const listeners = new Set<(workspaceId: string) => void>();

/** Show `chatId` in its workspace: now if the workspace is open, else when it opens. */
export function requestChat(chatId: string): void {
  const ws = workspaceOfChat(chatId);
  requests.set(ws, chatId);
  for (const fn of listeners) fn(ws);
}

/** The chat the workspace was asked to show, taken once. */
export function takeChatRequest(workspaceId: string): string | undefined {
  const chatId = requests.get(workspaceId);
  requests.delete(workspaceId);
  return chatId;
}

export function onChatRequest(fn: (workspaceId: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
