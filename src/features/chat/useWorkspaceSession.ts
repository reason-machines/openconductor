import { useMemo, useSyncExternalStore } from "react";
import { workspaceSessionStatus } from "../../state/workspaceSessions.ts";
import type { SessionStatus } from "../../state/rowStatus.ts";
import { chatStatuses, subscribeChatStatuses } from "./chatRuntime.ts";

/** The workspace's aggregated session status, live from every chat it has, open or not. */
export function useWorkspaceSessionStatus(workspaceId: string): SessionStatus {
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  return useMemo(() => workspaceSessionStatus(statuses, workspaceId), [statuses, workspaceId]);
}
