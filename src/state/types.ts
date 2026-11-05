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
  /** Worktree path, once the backend created it. */
  path?: string;
  /** `placeholder_branch_name`: the city branch, until the first message renames it. */
  placeholderBranchName?: string | null;
  /** `user_set_workspace_name` / `user_set_branch_name`: block the auto-rename. */
  userSetWorkspaceName?: boolean;
  userSetBranchName?: boolean;
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
}

export type Selection = { kind: "home" } | { kind: "workspace"; repoId: string; workspaceId: string };

export interface AppState {
  repos: Repo[];
  selection: Selection;
  /** Left sidebar shown; absent in older saved state, which means shown. */
  sidebarVisible?: boolean;
}
