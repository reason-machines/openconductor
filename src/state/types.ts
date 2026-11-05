import type { WorkspaceStatusValue } from "./workspaceStatus.ts";
import type { RowPr, SessionStatus } from "./rowStatus.ts";
import type { NavSection } from "./navigationSections.ts";

/** The workspace's lifecycle in this shell; what its agent is doing is `sessionStatus`. */
export type WorkspaceStatus = "idle" | "needs-review" | "archived";

export interface Workspace {
  id: string;
  /** Short display name for the workspace (also its worktree folder name). */
  name: string;
  /** `workspaces.directory_name`: the worktree folder; `name` is `workspace_name` when one is stored. */
  directoryName?: string;
  /** Git branch checked out in this workspace's worktree. */
  branch: string;
  status: WorkspaceStatus;
  /**
   * The most urgent status across the workspace's sessions (Conductor's
   * `aggregatedStatus`, folded with `aggregateSessions`): working, cancelling,
   * waiting for background tasks, or needing a plan response, an answer or a
   * permission. Absent means idle. Live only: nothing reports a closed agent.
   */
  sessionStatus?: SessionStatus;
  /** Lines added/removed versus the base branch; filled by the backend later. */
  diff: { added: number; removed: number };
  createdAt: number;
  /** Last activity; the sidebar lists the newest first. Falls back to createdAt. */
  updatedAt?: number;
  /** Worktree path, once the backend created it. */
  path?: string;
  /** `intended_target_branch`: where the work merges back; "All changes" is diffed against it. */
  targetBranch?: string | null;
  /** `placeholder_branch_name`: the city branch, until the first message renames it. */
  placeholderBranchName?: string | null;
  /** `workspaces.workspace_name` as stored; the sidebar label shows it before the PR title. */
  workspaceName?: string | null;
  /** `user_set_workspace_name` / `user_set_branch_name`: block the auto-rename. */
  userSetWorkspaceName?: boolean;
  userSetBranchName?: boolean;
  /** Title of the workspace's pull request; the sidebar row shows it in place of the branch. */
  prTitle?: string | null;
  /** Body of the workspace's pull request (`pr_description`); Create PR uses it verbatim. */
  prDescription?: string | null;
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
  /** `workspaces.state` (initializing, setting_up, ready, failed, ...): the row shows setup and failure. */
  state?: string;
  /** The workspace's pull request as last read from GitHub; drives the row's status icon. */
  pr?: RowPr | null;
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
  /** `repos.icon`: "emoji:<e>", an uploaded data:image URL, or a bundled icon name (src/state/repoIcon.ts). */
  icon?: string | null;
}

/**
 * `root` is Conductor's `/` route: the wordmark and the three entry cards, shown at
 * start and when the open workspace goes away. `home` is its `/all-workspaces`
 * route, the workspace list that the sidebar Home row and nav.home open.
 */
export type Selection = { kind: "root" } | { kind: "home" } | { kind: "workspace"; repoId: string; workspaceId: string };

export interface AppState {
  repos: Repo[];
  selection: Selection;
  /** Left sidebar shown; absent in older saved state, which means shown. */
  sidebarVisible?: boolean;
  /** User sidebar sections, in sidebar order (conductor.db `navigation_sections`). */
  sections?: NavSection[];
  /** When the section layout last changed (ms); a write older than the stored one is refused. */
  sectionsUpdatedAt?: number;
}
