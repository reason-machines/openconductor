import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import type { SessionStatus } from "../../state/rowStatus.ts";
import type { Workspace } from "../../state/types.ts";
import { chatStatuses, subscribeChatStatuses } from "./chatRuntime.ts";

/**
 * The status a workspace's agent shows (sidebar row and Home): every chat's stored or live status, open or not, folded with
 * `aggregateSessions`. `ws.sessionStatus` (the demo's) counts only when the
 * workspace has no chat here and is not `open`: the open view runs the
 * workspace's own agent, which reports through its chats (idle until a turn).
 */
export function useWorkspaceAgentStatus(ws: Pick<Workspace, "id" | "sessionStatus">, open = false): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  const fallback = open ? undefined : ws.sessionStatus;
  return useMemo(() => workspaceSessionStatus(statuses, ws.id, fallback), [statuses, ws.id, fallback]);
}
