// The status a sidebar row's icon shows. Ported from Conductor's renderApp
// chunk (REA, read as data): `oWt` picks the row status, `cWt` the git status,
// `xze` labels them, `dWt` colours them, and `nTr` ranks a workspace's sessions.
// This is not the manual Backlog/In progress status (workspaceStatus.ts):
// that one groups the sidebar, this one draws the row's icon.

export type RowStatus =
  | "unstarted"
  | "setting-up"
  | "failed"
  | "needs-plan-response"
  | "needs-user-permission"
  | "needs-user-input"
  | "working"
  | "cancelling"
  | "waiting"
  | "merged"
  | "merge-queued"
  | "ready-to-merge"
  | "draft-pr"
  | "merge-conflict"
  | "checks-failing"
  | "checks-pending"
  | "open-pr"
  | "local"
  | "branch";

/** Session statuses, most urgent first (Conductor's `tTr`). */
export const SESSION_STATUS_ORDER = [
  "needs_plan_response",
  "needs_user_permission",
  "needs_user_input",
  "working",
  "cancelling",
  "waiting",
  "error",
  "idle",
] as const;
export type SessionStatus = (typeof SESSION_STATUS_ORDER)[number];

/** The PR fields the row status reads (Conductor's `DXo` selector). */
export interface RowPr {
  number: number;
  isMerged: boolean;
  isDraft: boolean;
  inMergeQueue: boolean;
  /** GitHub mergeStateStatus: CLEAN, UNSTABLE, DIRTY, BLOCKED, ... */
  mergeState: string | null;
  checks: "passing" | "pending" | "failing" | null;
  failingChecks: number;
  viewerCanMerge: boolean | null;
  /** "Treat optional checks as blocking" when the PR was read. */
  optionalChecksBlock?: boolean;
}

export interface RowStatusInput {
  /** `workspaces.state` from conductor.db. */
  workspaceState?: string;
  /** The workspace's sessions folded with `aggregateSessions`. */
  session?: SessionStatus;
  pr?: RowPr | null;
  hasRemote?: boolean;
  gitForge?: string;
  /** "Treat optional checks as blocking" (PR settings). */
  optionalChecksBlock?: boolean;
}

/** The most urgent status across a workspace's visible sessions (`nTr`). */
export function aggregateSessions(statuses: readonly string[]): SessionStatus {
  return SESSION_STATUS_ORDER.find((s) => statuses.includes(s)) ?? "idle";
}

const FROM_WORKSPACE_STATE: Record<string, RowStatus> = {
  unstarted: "unstarted",
  initializing: "setting-up",
  failed: "failed",
  setting_up: "setting-up",
};

const FROM_SESSION: Partial<Record<SessionStatus, RowStatus>> = {
  needs_plan_response: "needs-plan-response",
  needs_user_permission: "needs-user-permission",
  needs_user_input: "needs-user-input",
  working: "working",
  cancelling: "cancelling",
  waiting: "waiting",
};

const openPr = (pr: RowPr | null | undefined): pr is RowPr => Boolean(pr?.number) && !pr!.isMerged;

/** `RXo`: GitHub would let the viewer merge now. */
function readyToMerge(pr: RowPr | null | undefined, optionalChecksBlock: boolean): boolean {
  if (!openPr(pr) || pr.isDraft || pr.viewerCanMerge === false) return false;
  if (pr.mergeState === "CLEAN") return true;
  if (pr.mergeState !== "UNSTABLE") return false;
  return !optionalChecksBlock || pr.failingChecks === 0;
}

type Rule = (i: RowStatusInput) => RowStatus | undefined;

const PR_RULES: Rule[] = [
  ({ pr }) => (pr?.isMerged ? "merged" : undefined),
  ({ pr }) => (pr?.inMergeQueue ? "merge-queued" : undefined),
  (i) => (readyToMerge(i.pr, i.optionalChecksBlock ?? i.pr?.optionalChecksBlock ?? false) ? "ready-to-merge" : undefined),
  ({ pr }) => (openPr(pr) && pr.isDraft ? "draft-pr" : undefined),
  ({ pr }) => (pr?.mergeState === "DIRTY" ? "merge-conflict" : undefined),
  ({ pr }) => (pr?.checks === "failing" ? "checks-failing" : undefined),
];
const OPEN_PR: Rule = ({ pr }) => (openPr(pr) ? "open-pr" : undefined);
/** The row icon skips checks-pending; the git status keeps it (`kXo` vs `TXo`). */
const STATUS_RULES = [...PR_RULES, OPEN_PR];
const GIT_RULES = [...PR_RULES, ({ pr }: RowStatusInput) => (pr?.checks === "pending" ? ("checks-pending" as const) : undefined), OPEN_PR];

function firstRule(i: RowStatusInput, rules: Rule[]): RowStatus {
  for (const rule of rules) {
    const s = rule(i);
    if (s !== undefined) return s;
  }
  return (i.hasRemote ?? i.gitForge === "github") ? "branch" : "local";
}

/** The row's status (`oWt`): workspace setup, then the agent, then the PR, then the branch. */
export function rowStatus(i: RowStatusInput): RowStatus {
  const fromState = i.workspaceState === undefined ? undefined : FROM_WORKSPACE_STATE[i.workspaceState];
  if (fromState) return fromState;
  const fromSession = i.session === undefined ? undefined : FROM_SESSION[i.session];
  if (fromSession) return fromSession;
  return firstRule(i, STATUS_RULES);
}

/** The PR/branch status alone (`cWt`), which also reports running checks. */
export function rowGitStatus(i: RowStatusInput): RowStatus {
  return firstRule(i, GIT_RULES);
}

/** PR and branch statuses (`AXo`/`Cet`). */
const GIT_STATUSES = new Set<RowStatus>(["merged", "merge-queued", "ready-to-merge", "draft-pr", "merge-conflict", "checks-failing", "checks-pending", "open-pr", "local", "branch"]);

/**
 * Home's status for a row: Conductor's Home row (`vJo`'s caller) runs `oWt`
 * with only the sessions' status and the workspace state, no PR.
 */
export function homeStatus(workspaceState: string | undefined, session: SessionStatus): RowStatus {
  return rowStatus({ workspaceState, session });
}

/**
 * Home shows this status in place of the last-activity time (`aWt`): the
 * setup and agent statuses, not a git status and not "unstarted".
 */
export const showsActivityStatus = (s: RowStatus): boolean => !GIT_STATUSES.has(s) && s !== "unstarted";

const BUSY = new Set<RowStatus>(["setting-up", "working", "cancelling", "waiting"]);
/** Statuses drawn as an animated loader instead of an icon (`sFi`). */
export const isBusyStatus = (s: RowStatus) => BUSY.has(s);

const LABEL: Record<RowStatus, string> = {
  unstarted: "Unstarted",
  "setting-up": "Setting up",
  failed: "Failed",
  "needs-plan-response": "Needs plan response",
  "needs-user-permission": "Needs permission",
  "needs-user-input": "Needs input",
  working: "Working",
  cancelling: "Cancelling",
  waiting: "Waiting for background tasks",
  merged: "Merged",
  "merge-queued": "In merge queue",
  "ready-to-merge": "Ready to merge",
  "draft-pr": "Draft pull request",
  "merge-conflict": "Merge conflict",
  "checks-failing": "Checks failing",
  "checks-pending": "Checks running",
  "open-pr": "Pull request open",
  local: "Local workspace",
  branch: "Ready",
};
export const rowStatusLabel = (s: RowStatus) => LABEL[s];

export type RowStatusColor = "destructive" | "merged" | "in-progress" | "ready" | "conflict" | "checks-pending" | "muted";

/** The icon's colour (`dWt`). */
export function rowStatusColor(s: RowStatus): RowStatusColor {
  switch (s) {
    case "failed":
    case "checks-failing":
      return "destructive";
    case "merged":
      return "merged";
    case "merge-queued":
      return "in-progress";
    case "ready-to-merge":
      return "ready";
    case "merge-conflict":
      return "conflict";
    case "checks-pending":
      return "checks-pending";
    default:
      return "muted";
  }
}
