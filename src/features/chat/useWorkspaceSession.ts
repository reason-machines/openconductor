import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import type { SessionStatus } from "../../state/rowStatus.ts";
import type { Workspace } from "../../state/types.ts";
import { chatStatuses, subscribeChatStatuses } from "./reasonChat.ts";

/**
 * The workspace's aggregated session status, live from every chat it has in
 * this window, open or not; `ws.sessionStatus` (the demo's) only when it has none.
 * The sidebar row, Home and the workspace header show it.
 */
export function useWorkspaceSession(ws: Pick<Workspace, "id" | "sessionStatus">): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  return useMemo(() => workspaceSessionStatus(statuses, ws.id, ws.sessionStatus), [statuses, ws.id, ws.sessionStatus]);
}
