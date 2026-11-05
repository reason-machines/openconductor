// Sidebar row actions written through to conductor.db in the desktop app
// (src-tauri/src/sidebar_workspace_commands.rs). The reducer has already
// applied the change; the database keeps it across a reload.
import type { Action } from "./store";

export interface SidebarWrite {
  command: "db_set_workspace_pinned" | "db_set_workspace_unread" | "db_set_workspace_manual_status";
  args: Record<string, unknown>;
}

/** The database write an action needs, if it is a sidebar row action. */
export function sidebarWrite(action: Action): SidebarWrite | undefined {
  switch (action.type) {
    case "setWorkspacePinned":
      return { command: "db_set_workspace_pinned", args: { workspaceId: action.workspaceId, pinned: action.pinned } };
    case "setWorkspaceUnread":
      return { command: "db_set_workspace_unread", args: { workspaceId: action.workspaceId, unread: action.unread } };
    case "setWorkspaceStatus":
      return { command: "db_set_workspace_manual_status", args: { workspaceId: action.workspaceId, status: action.status } };
    default:
      return undefined;
  }
}
