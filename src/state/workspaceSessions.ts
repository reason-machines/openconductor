// parity:sidebar.ws-status
// A workspace's session status for its sidebar row: Conductor's row hook
// (`aFi`, REA-read renderApp chunk) loads the workspace's sessions and folds
// their `sessions.status` with `nTr` (aggregateSessions). Here the sessions
// are the chats in the chat store: the main chat's id is the workspace id and
// a review chat's is `<workspace id>:review:<n>` (features/diff/ReviewButton)
// and the main chat's Claude Code chat is `<workspace id>:claude`
// (features/chat/claudeChat).
import { aggregateSessions, type SessionStatus } from "./rowStatus.ts";

const REVIEW = ":review:";
const CLAUDE = ":claude";

/** The workspace a chat belongs to. */
export function workspaceOfChat(chatId: string): string {
  const i = chatId.indexOf(REVIEW);
  if (i >= 0) return chatId.slice(0, i);
  return chatId.endsWith(CLAUDE) ? chatId.slice(0, -CLAUDE.length) : chatId;
}

/** The most urgent status across the workspace's chats; idle when it has none. */
export function workspaceSessionStatus(statuses: ReadonlyMap<string, string>, workspaceId: string): SessionStatus {
  const own: string[] = [];
  for (const [chatId, status] of statuses) if (workspaceOfChat(chatId) === workspaceId) own.push(status);
  return aggregateSessions(own);
}
