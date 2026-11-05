import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import { aggregateSessions, type SessionStatus } from "../../state/rowStatus.ts";
import { chatStatuses, subscribeChatStatuses } from "./reasonChat.ts";

/** The workspace's aggregated session status, live from every chat it has, open or not. */
export function useWorkspaceSessionStatus(workspaceId: string): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  return useMemo(() => workspaceSessionStatus(statuses, workspaceId), [statuses, workspaceId]);
}

/**
 * The status a workspace row (sidebar and Home) shows for its agent: every
 * chat's stored or live status, plus what the open view reports (`working`).
 */
export function useWorkspaceAgentStatus(ws: { id: string; status?: string }): SessionStatus {
  const chats = useWorkspaceSessionStatus(ws.id);
  return aggregateSessions([chats, ws.status === "working" ? "working" : "idle"]);
}
