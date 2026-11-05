// Every chat's session status (Conductor's `sessions.status`), so a sidebar
// row and Home can show a workspace's agents while the workspace is not open:
// chats keep running after their view unmounts. A chat id can run Reason or
// Codex (the composer's agent picker), so each agent publishes its own status
// and the chat shows the most urgent of them (`aggregateSessions`). Closed
// (hidden) chats drop out, as Conductor folds only a workspace's visible
// sessions.

import { aggregateSessions, type SessionStatus } from "../../state/rowStatus.ts";

export type ChatAgentKind = "reason" | "codex";

const bySource = new Map<string, Map<ChatAgentKind, SessionStatus>>();
let statuses: ReadonlyMap<string, SessionStatus> = new Map();
const hidden = new Set<string>();
const listeners = new Set<() => void>();

function refresh(chatId: string) {
  const own = bySource.get(chatId);
  const status = hidden.has(chatId) || !own || own.size === 0 ? undefined : aggregateSessions([...own.values()]);
  if (statuses.get(chatId) === status) return;
  const next = new Map(statuses);
  if (status === undefined) next.delete(chatId);
  else next.set(chatId, status);
  statuses = next;
  for (const fn of listeners) fn();
}

/** The status `agent` reports for the chat. */
export function publishChatStatus(chatId: string, agent: ChatAgentKind, status: SessionStatus): void {
  let own = bySource.get(chatId);
  if (!own) bySource.set(chatId, (own = new Map()));
  if (own.get(agent) === status) return;
  own.set(agent, status);
  refresh(chatId);
}

/** Chat id → session status of every visible chat; a new map on each change. */
export const chatStatuses = (): ReadonlyMap<string, SessionStatus> => statuses;

/** Each agent's status in a chat, e.g. to stop the ones still running. */
export const chatAgentStatuses = (chatId: string): ReadonlyMap<ChatAgentKind, SessionStatus> => bySource.get(chatId) ?? new Map();

export function subscribeChatStatuses(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A closed chat tab: its agent no longer counts toward the workspace's status. */
export function hideChat(chatId: string): void {
  hidden.add(chatId);
  refresh(chatId);
}
