// Sidebar row actions written through to conductor.db in the desktop app
// (src-tauri/src/sidebar_workspace_commands.rs). The reducer has already
// applied the change; the database keeps it across a reload.
import type { Action } from "./store";

export interface SidebarWrite {
  command: "db_set_workspace_pinned" | "db_set_workspace_unread" | "db_set_workspace_manual_status" | "db_touch_workspace";
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
    case "touchWorkspace":
      // Every send, Codex's included (Codex chats do not go through chat_messages_save), moves
      // workspaces.updated_at forward (Conductor's setSessionUpdatedAt, index-BGEQ8YjU.js @1,066,404).
      return { command: "db_touch_workspace", args: { workspaceId: action.workspaceId, at: action.at } };
    case "assignSection":
      // Assigning a section unpins the workspace (Conductor's `k$t` calls setWorkspacePinned false).
      return action.sectionId === null ? undefined : { command: "db_set_workspace_pinned", args: { workspaceId: action.workspaceId, pinned: false } };
    default:
      return undefined;
  }
}
