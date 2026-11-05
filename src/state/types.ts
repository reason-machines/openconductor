import type { WorkspaceStatusValue } from "./workspaceStatus.ts";

export type WorkspaceStatus = "idle" | "working" | "needs-review" | "archived";

export interface Workspace {
  id: string;
  /** Short display name for the workspace (also its worktree folder name). */
  name: string;
  /** Git branch checked out in this workspace's worktree. */
  branch: string;
  status: WorkspaceStatus;
  /** Lines added/removed versus the base branch; filled by the backend later. */
  diff: { added: number; removed: number };
  createdAt: number;
  /** Last activity; the sidebar lists the newest first. Falls back to createdAt. */
  updatedAt?: number;
  /** Worktree path, once the backend created it. */
  path?: string;
  /** `placeholder_branch_name`: the city branch, until the first message renames it. */
  placeholderBranchName?: string | null;
  /** `user_set_workspace_name` / `user_set_branch_name`: block the auto-rename. */
  userSetWorkspaceName?: boolean;
  userSetBranchName?: boolean;
  /** Title of the workspace's pull request; the sidebar row shows it in place of the branch. */
  prTitle?: string | null;
  /** Unread agent output; the sidebar row's name turns semibold. */
  unread?: boolean;
  /* sidebar: pin and status (Conductor's pinned_at, manual_status, derived_status) */
  /** When the workspace was pinned (ms); pinned rows sit in the sidebar's Pinned group. */
  pinnedAt?: number;
  /** Status the user set from the row menu; wins over the derived one. */
  manualStatus?: WorkspaceStatusValue;
  derivedStatus?: WorkspaceStatusValue;
  /** `workspaces.number`, given on creation and shown as `W-<n>`; null for workspaces from before numbering. */
  number?: number | null;
}

export interface Repo {
  id: string;
  name: string;
  /** Local path of the source checkout; empty until a real clone exists. */
  path: string;
  /** Where the repo came from, e.g. a GitHub URL, if it was cloned. */
  remote?: string;
  defaultBranch: string;
  workspaces: Workspace[];
  collapsed?: boolean;
  /** `repos.hidden`: left out of the sidebar unless "show hidden" is on. */
  hidden?: boolean;
}

export type Selection = { kind: "home" } | { kind: "workspace"; repoId: string; workspaceId: string };

export interface AppState {
  repos: Repo[];
  selection: Selection;
  /** Left sidebar shown; absent in older saved state, which means shown. */
  sidebarVisible?: boolean;
}
