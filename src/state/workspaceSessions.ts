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

/** The most urgent status across the workspace's chats; idle when it has none. */
export function workspaceSessionStatus(statuses: ReadonlyMap<string, string>, workspaceId: string): SessionStatus {
  const own: string[] = [];
  for (const [chatId, status] of statuses) if (workspaceOfChat(chatId) === workspaceId) own.push(status);
  return aggregateSessions(own);
}
