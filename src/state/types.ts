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
}
