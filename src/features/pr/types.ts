// Wire shapes of the PR commands (src-tauri/src/pr/). Field names are the
// Rust serde names; see evidence/pr/NOTES.md for the reference behavior.

export type MergeStateStatus = "CLEAN" | "DIRTY" | "BEHIND" | "UNSTABLE" | "BLOCKED" | "DRAFT" | "HAS_HOOKS" | "UNKNOWN";
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED";
export type MergeQueueState = "AWAITING_CHECKS" | "LOCKED" | "MERGEABLE" | "QUEUED" | "UNMERGEABLE" | "OTHER";
export type MergeMethod = "squash" | "merge" | "rebase";

/** A check run (`name`, `status`, `conclusion`) or a commit status (`context`, `state`). */
export interface Check {
  conclusion: string | null;
  status: string | null;
  name: string | null;
  workflowName: string | null;
  detailsUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  state: string | null;
  context: string | null;
  targetUrl: string | null;
}

export interface ChecksSummary {
  status: "passing" | "pending" | "failing" | null;
  numPending: number;
  numChecks: number | null;
  failing: Check[];
  checks: Check[] | null;
  vercelUrl: string | null;
}

export interface PrStatus {
  mergeState: MergeStateStatus;
  checks: ChecksSummary;
  reviewDecision: ReviewDecision | null;
  numReviewRequests: number;
}

export interface PrInfo {
  number: number;
  url: string;
  title: string;
  body: string;
  authorLogin: string | null;
  baseRefName: string;
  baseRefOid: string | null;
  headRefName: string;
  headRefOid: string;
  viewerDidAuthor: boolean | null;
  viewerLatestReview: { commitOid: string | null } | null;
  viewerCanMerge: boolean | null;
  isDraft: boolean;
  isMerged: boolean;
  isAutoMergeEnabled: boolean;
  mergeQueue: { state: MergeQueueState; position: number; enqueuedAt: string; estimatedTimeToMerge: number | null } | null;
  status: PrStatus | null;
}

export type PrLookup = { kind: "none" } | { kind: "closed" } | { kind: "found"; info: PrInfo };

export type WorkspacePrStatus = "backlog" | "in-progress" | "in-review" | "done" | "canceled";

export interface LookupRequest {
  workspacePath: string;
  localBranch: string;
  workspaceBranch: string;
  upstreamBranch?: string | null;
  prNumber?: number | null;
}

/** What `pr_sync_workspace` wrote to the workspace row. */
export interface WorkspaceSync {
  /** The derived status was stored and the manual status cleared. */
  statusChanged: boolean;
  metadataChanged: boolean;
}

export interface LookupResult {
  /** null when it could not be determined this time; keep the previous one. */
  lookup: PrLookup | null;
  derivedStatus: WorkspacePrStatus | null;
}

export interface UpstreamSync {
  branchExists: boolean;
  diverged: boolean;
  ahead: number;
  behind: number;
}

/** `pr_git_state`: local facts the header control needs. */
export interface GitState {
  hasUncommitted: boolean;
  hasChanges: boolean;
  hasRemote: boolean;
  canCreatePr: boolean;
  remote: string | null;
  upstream: UpstreamSync | null;
}

export type Tone = "no_pr" | "loading" | "out_of_sync" | "in_sync" | "queued" | "merged";

export type HeaderAction =
  | { type: "create_pr" }
  | { type: "working" }
  | { type: "loading_pr" }
  | { type: "commit_and_push" }
  | { type: "incompatible" }
  | { type: "pull"; behind: number }
  | { type: "push"; ahead: number }
  | { type: "merge_conflicts" }
  | { type: "changes_requested"; hasPendingComments: boolean }
  | { type: "draft_pr" }
  | { type: "checks_failing"; failed: number; total: number | null; pending: number; fixable: boolean }
  | { type: "checks_pending"; pending: number }
  | { type: "approve_pr" }
  | { type: "review_required" }
  | { type: "blocked" }
  | { type: "ready_to_merge"; optionalFailed: number }
  | { type: "unable_to_merge" }
  | { type: "queued_to_merge"; state: MergeQueueState }
  | { type: "merged" };

export interface HeaderState {
  tone: Tone;
  action: HeaderAction;
}

/** `pr_header_state` inputs (`header::HeaderInputs`). */
export interface HeaderInputs {
  pr: PrLookup | null;
  canCreatePr: boolean;
  hasRemote: boolean;
  loading: boolean;
  hasChanges: boolean;
  hasUncommitted: boolean;
  agentWorking: boolean;
  upstream: UpstreamSync | null;
  hasPendingComments: boolean;
  optionalChecksBlock: boolean;
}

/** `pr_create_prompt` request (`api::CreatePrPrompt`). */
export interface CreatePrPrompt {
  branch: string;
  remote: string;
  targetBranch: string;
  draft: boolean;
  diffTool?: string | null;
  title?: string | null;
  description?: string | null;
  template?: string | null;
  /** Null sends none, so `pr_create_prompt` falls back to `prompts.create_pr` from the settings files of `repoPath` / `workspacePath`. */
  customInstructions?: string | null;
  /** The repository's main checkout, for reading its settings files. */
  repoPath?: string | null;
  /** The workspace the PR is opened from, for its workspace settings layer. */
  workspacePath?: string | null;
}
