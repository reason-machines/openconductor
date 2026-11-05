import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import { aggregateSessions, type SessionStatus } from "../../state/rowStatus.ts";
import type { Workspace } from "../../state/types.ts";
import { chatStatuses, subscribeChatStatuses } from "./reasonChat.ts";

/** The workspace's aggregated session status, live from every chat it has, open or not. */
export function useWorkspaceSessionStatus(workspaceId: string): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  return useMemo(() => workspaceSessionStatus(statuses, workspaceId), [statuses, workspaceId]);
}

/**
 * What the sidebar row, Home and the workspace header show for the workspace's
 * sessions: its chats in this window folded with `ws.sessionStatus` (statuses
 * from elsewhere: the demo today), most urgent first.
 */
export function useWorkspaceSession(ws: Pick<Workspace, "id" | "sessionStatus">): SessionStatus {
  const live = useWorkspaceSessionStatus(ws.id);
  return ws.sessionStatus === undefined ? live : aggregateSessions([live, ws.sessionStatus]);
}
