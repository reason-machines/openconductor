// parity:sidebar.ws-unread
// Which chats of a workspace can be shown, and requests to show one.
//
// A workspace's chats are its main chat (id = workspace id) and the review chats
// whose tabs are open (features/diff/ReviewButton.tsx reports them here). Go to
// next unread and a click on the selected row open a chat by id (Conductor
// navigates with the session's tab, renderApp `g1o` @7,528,638 and the row click
// @9,885,472); the workspace view takes the request when it shows that workspace.
//
// Open tabs are stored in conductor.db (`db_open_chat_tab`, `db_close_chat_tab`)
// and come back after a restart (`restoreChatTabs`), as Conductor's do: its review
// chat is a `sessions` row (`createSession`, index-BGEQ8YjU.js `GNt` at 1949:3602)
// and its tab strip is the workspace's non-hidden sessions (`ylt` at 1226:63776).
import { workspaceOfChat } from "./workspaceSessions.ts";

/** A chat tab as stored in conductor.db: a `chatTabs` entry of a `db_list_workspaces` row. */
export interface StoredChatTab {
  id: string;
  title: string;
}

const reviewChats = new Map<string, readonly string[]>();
const restored = new Map<string, readonly StoredChatTab[]>();
/** Workspaces whose tab strip this window has set; a later database read does not override it. */
const setHere = new Set<string>();

/** The review chats with an open tab in the workspace, in strip order. */
export function setOpenReviewChats(workspaceId: string, chatIds: readonly string[]): void {
  setHere.add(workspaceId);
  restored.delete(workspaceId);
  if (chatIds.length > 0) reviewChats.set(workspaceId, chatIds);
  else reviewChats.delete(workspaceId);
}

/**
 * The tabs that were open when the app last ran, read from conductor.db. They
 * count for unread and Go to next unread until the workspace's strip changes in
 * this window, which then owns it.
 */
export function restoreChatTabs(workspaceId: string, tabs: readonly StoredChatTab[]): void {
  if (setHere.has(workspaceId)) return;
  if (tabs.length > 0) {
    restored.set(workspaceId, tabs);
    reviewChats.set(
      workspaceId,
      tabs.map((t) => t.id),
    );
  } else {
    restored.delete(workspaceId);
    reviewChats.delete(workspaceId);
  }
}

/** The restored tabs of a workspace whose strip this window has not set yet. */
export function restoredChatTabs(workspaceId: string): readonly StoredChatTab[] {
  return restored.get(workspaceId) ?? [];
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

/** A strip change as conductor.db writes: tabs that opened and tabs that closed. */
export type ChatTabWrite = { command: "db_open_chat_tab"; args: { chatId: string; workspaceId: string; title: string } } | { command: "db_close_chat_tab"; args: { chatId: string } };

/** The writes that take the stored strip from `prev` to `next`. */
export function chatTabWrites(workspaceId: string, prev: readonly { chatId: string; title: string }[], next: readonly { chatId: string; title: string }[]): ChatTabWrite[] {
  const before = new Set(prev.map((t) => t.chatId));
  const after = new Set(next.map((t) => t.chatId));
  return [
    ...next.filter((t) => !before.has(t.chatId)).map((t): ChatTabWrite => ({ command: "db_open_chat_tab", args: { chatId: t.chatId, workspaceId, title: t.title } })),
    ...prev.filter((t) => !after.has(t.chatId)).map((t): ChatTabWrite => ({ command: "db_close_chat_tab", args: { chatId: t.chatId } })),
    // "Rename chat": the same upsert stores the new title (`sessions::open_tab`).
    ...next
      .filter((t) => prev.some((p) => p.chatId === t.chatId && p.title !== t.title))
      .map((t): ChatTabWrite => ({ command: "db_open_chat_tab", args: { chatId: t.chatId, workspaceId, title: t.title } })),
  ];
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
