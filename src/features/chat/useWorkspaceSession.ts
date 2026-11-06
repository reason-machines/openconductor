import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import type { SessionStatus } from "../../state/rowStatus.ts";
import type { Workspace } from "../../state/types.ts";
import { chatStatuses, subscribeChatStatuses } from "./chatRuntime.ts";

/**
 * The status a workspace's agent shows (sidebar row, Home and the workspace
 * header): every chat's stored or live status, open or not, folded with
 * `aggregateSessions`. `ws.sessionStatus` (the demo's) counts only when the
 * workspace has no chat here.
 */
export function useWorkspaceAgentStatus(ws: Pick<Workspace, "id" | "sessionStatus">): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  return useMemo(() => workspaceSessionStatus(statuses, ws.id, ws.sessionStatus), [statuses, ws.id, ws.sessionStatus]);
}
