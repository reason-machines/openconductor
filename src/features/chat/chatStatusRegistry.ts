// parity:sidebar.ws-status
// Every chat's session status (Conductor's `sessions.status`), so a sidebar
// row, Home and archive can see a workspace's agents while that workspace is
// not open: chats keep running here after their view unmounts. Each agent
// (Reason, Codex) reports its own chats; a chat id that both have folds to
// the more urgent status. Closed (hidden) chats drop out, as Conductor folds
// only a workspace's visible sessions.
import { aggregateSessions, type SessionStatus } from "../../state/rowStatus.ts";

export type ChatAgentKind = "reason" | "codex";

const byAgent = new Map<string, Map<ChatAgentKind, SessionStatus>>();
const hidden = new Set<string>();
let statuses: ReadonlyMap<string, SessionStatus> = new Map();
const listeners = new Set<() => void>();

function republish(chatId: string) {
  const own = hidden.has(chatId) ? undefined : byAgent.get(chatId);
  const status = own && own.size > 0 ? aggregateSessions([...own.values()]) : undefined;
  if (statuses.get(chatId) === status) return;
  const next = new Map(statuses);
  if (status === undefined) next.delete(chatId);
  else next.set(chatId, status);
  statuses = next;
  for (const fn of listeners) fn();
}

/** `agent` reports its chat's status; undefined drops the chat from that agent. */
export function reportChatStatus(chatId: string, agent: ChatAgentKind, status: SessionStatus | undefined): void {
  const own = byAgent.get(chatId) ?? new Map<ChatAgentKind, SessionStatus>();
  if (own.get(agent) === status) return;
  if (status === undefined) own.delete(agent);
  else own.set(agent, status);
  if (own.size === 0) byAgent.delete(chatId);
  else byAgent.set(chatId, own);
  republish(chatId);
}

/** A closed chat tab: its agents no longer count toward the workspace's status. */
export function hideChatStatus(chatId: string): void {
  hidden.add(chatId);
  republish(chatId);
}

/** Chat id → session status of every visible chat; a new map on each change. */
export const chatStatuses = (): ReadonlyMap<string, SessionStatus> => statuses;

export function subscribeChatStatuses(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
