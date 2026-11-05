// parity:sidebar.ws-status
// A workspace's session status for its sidebar row: Conductor's row hook
// (`aFi`, REA-read renderApp chunk) loads the workspace's sessions and folds
// their `sessions.status` with `nTr` (aggregateSessions). Here the sessions
// are the chats in the chat store: the main chat's id is the workspace id and
// a review chat's is `<workspace id>:review:<n>` (features/diff/ReviewButton).
import { aggregateSessions, type SessionStatus } from "./rowStatus.ts";

const REVIEW = ":review:";

/** The workspace a chat belongs to. */
export function workspaceOfChat(chatId: string): string {
  const i = chatId.indexOf(REVIEW);
  return i < 0 ? chatId : chatId.slice(0, i);
}

/** The status of each of the workspace's chats in this window; `[fallback]` when it has none. */
export function workspaceChatStatuses(statuses: ReadonlyMap<string, string>, workspaceId: string, fallback?: SessionStatus): string[] {
  const own: string[] = [];
  for (const [chatId, status] of statuses) if (workspaceOfChat(chatId) === workspaceId) own.push(status);
  return own.length === 0 && fallback !== undefined ? [fallback] : own;
}

/**
 * The most urgent status across the workspace's chats. With none in this
 * window, `fallback` (the workspace's `sessionStatus` from elsewhere: the demo
 * today), else idle. A chat this window runs always wins over the fallback.
 */
export function workspaceSessionStatus(statuses: ReadonlyMap<string, string>, workspaceId: string, fallback?: SessionStatus): SessionStatus {
  return aggregateSessions(workspaceChatStatuses(statuses, workspaceId, fallback));
}
