// parity:sidebar.ws-unread
// Unread is per chat, as in Conductor: `sessions.unread_count` (index-BGEQ8YjU.js
// `setUnread` -> `ret` @1,108,155; `markWorkspaceAsRead` -> `ntt` @1,141,730
// clears every session of the workspace). A workspace is unread while any of its
// non-hidden chats is (renderApp-D_fmY7hW.js `zJo` @9,817,504, `Zji` @9,773,017).
//
// Our chats are the workspace's main chat (id = workspace id) and its review
// chats (`<workspace id>:review:<n>`, features/diff/ReviewButton.tsx). An open
// review tab is stored in conductor.db and comes back after a restart with its
// unread, as in Conductor (state/openChat.ts); a review whose tab was closed
// counts as hidden (state/persisted.ts drops it).
import type { UnreadChat, Workspace } from "./types.ts";

type HasUnread = { unreadChats?: readonly UnreadChat[] };

/** The workspace has an unread chat. */
export function isWorkspaceUnread(ws: HasUnread): boolean {
  return (ws.unreadChats?.length ?? 0) > 0;
}

export function isChatUnread(ws: HasUnread, chatId: string): boolean {
  return ws.unreadChats?.some((c) => c.id === chatId) ?? false;
}

/**
 * The workspace with `chatId` marked unread (as of `at`) or read. Marking an
 * unread chat unread again moves its time, as the `sessions.updated_at` trigger
 * does on every update.
 */
export function withChatUnread(ws: Workspace, chatId: string, unread: boolean, at: number): Workspace {
  const others = (ws.unreadChats ?? []).filter((c) => c.id !== chatId);
  if (!unread && others.length === (ws.unreadChats?.length ?? 0)) return ws;
  const next = unread ? [...others, { id: chatId, at }] : others;
  return { ...ws, unreadChats: next.length > 0 ? next : undefined };
}

/** Every chat of the workspace read (`markWorkspaceAsRead`). */
export function withWorkspaceRead(ws: Workspace): Workspace {
  return ws.unreadChats ? { ...ws, unreadChats: undefined } : ws;
}

const NEEDS = new Set(["needs_plan_response", "needs_user_permission", "needs_user_input"]);

/**
 * The chat a click on the selected workspace's row opens: the first one, in
 * tab order, that is unread or waits on the user (renderApp `fea` @9,881,941
 * with `$Zo`: `unread || needs_*` status).
 */
export function attentionChat(ws: HasUnread, chatIds: readonly string[], statuses: ReadonlyMap<string, string>): { id: string; unread: boolean } | undefined {
  for (const id of chatIds) {
    const unread = isChatUnread(ws, id);
    if (unread || NEEDS.has(statuses.get(id) ?? "")) return { id, unread };
  }
  return undefined;
}
