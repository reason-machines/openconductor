// Pure Create-workspace flow: turns the dialog draft into a create request, and
// folds backend lifecycle events into the progress shown while the workspace
// comes up. Evidence and our own choices: evidence/create-workspace/README.md.

import {
  INVALID_WORKSPACE_NAME,
  applyBranchPrefix,
  initialNaming,
  validateBranchName,
  validateWorkspaceName,
  type WorkspaceNaming,
} from "./naming.ts";

/** What a workspace is created from, chosen in the "Create from..." picker. */
export type CreateFrom =
  | {
      kind: "pr";
      number: number;
      title: string;
      headBranch: string;
      baseBranch: string;
      /** Owner of the repository the PR's head branch lives in (`headRepositoryOwner.login`). */
      headOwner?: string;
      /** True when the head branch is on a fork (`isCrossRepository`), not on origin. */
      crossRepository?: boolean;
    }
  | { kind: "branch"; name: string }
  | { kind: "issue"; provider: "github" | "linear"; key: string; title: string; url?: string; body?: string };

export interface CreateDraft {
  repoId: string | null;
  /** The generated city name, or what the user typed over it. */
  name: string;
  /** True once the user edited the name field. */
  nameEdited: boolean;
  /** Base (target) branch; defaults to the repo's `default_branch`. */
  baseBranch: string;
  from: CreateFrom | null;
  firstMessage: string;
  agent: string;
  model: string;
  effort: string;
}

/** Sent to the backend: `workspace create --agent --model --effort --message`. */
export interface CreateRequest {
  repoId: string;
  naming: WorkspaceNaming;
  /** Branch to start from. For a PR or branch this is the branch itself. */
  startPoint: string;
  /** `intended_target_branch`: where the work merges back. */
  targetBranch: string;
  /** Check out an existing branch instead of creating a new one. */
  existingBranch: boolean;
  from: CreateFrom | null;
  firstSession: { agent: string; model: string; effort: string; message: string } | null;
}

export type DraftField = "repo" | "name" | "baseBranch" | "from";
export type DraftErrors = Partial<Record<DraftField, string>>;

export const NO_REPOSITORY = "Choose a repository";
export const CANNOT_CREATE_FROM_ISSUE = "Cannot create workspace from this issue";

/** Initial draft: placeholder city name and the repo's default branch. */
export function newDraft(opts: { repoId: string | null; defaultBranch: string; cityName: string; agent: string; model: string; effort: string }): CreateDraft {
  return {
    repoId: opts.repoId,
    name: opts.cityName,
    nameEdited: false,
    baseBranch: opts.defaultBranch || "main",
    from: null,
    firstMessage: "",
    agent: opts.agent,
    model: opts.model,
    effort: opts.effort,
  };
}

/**
 * Applies a create-from choice. A PR sets the target branch from the PR; an
 * issue seeds an empty composer with the issue so the first message carries it.
 */
export function selectFrom(draft: CreateDraft, from: CreateFrom | null): CreateDraft {
  const next = { ...draft, from };
  if (from?.kind === "pr") next.baseBranch = from.baseBranch;
  if (from?.kind === "issue" && !draft.firstMessage.trim()) next.firstMessage = issuePrompt(from);
  if (from === null && draft.from?.kind === "issue" && draft.firstMessage === issuePrompt(draft.from)) next.firstMessage = "";
  return next;
}

export function issuePrompt(issue: Extract<CreateFrom, { kind: "issue" }>): string {
  const head = `Work on ${issue.provider === "linear" ? "Linear" : "GitHub"} issue ${issue.key}: ${issue.title}`;
  return [head, issue.url, issue.body?.trim()].filter(Boolean).join("\n\n");
}

/** Validates the draft and builds the request, or returns per-field errors. */
export function buildCreateRequest(
  draft: CreateDraft,
  prefix: string,
): { ok: true; request: CreateRequest } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  if (!draft.repoId) errors.repo = NO_REPOSITORY;
  const name = validateWorkspaceName(draft.name);
  if (!name.ok) errors.name = INVALID_WORKSPACE_NAME;
  const base = validateBranchName(draft.baseBranch);
  if (!base.ok) errors.baseBranch = base.error;

  let branch: string | undefined;
  if (draft.from?.kind === "pr") branch = prBranchName(draft.from);
  if (draft.from?.kind === "branch") branch = draft.from.name;
  if (branch !== undefined) {
    const check = validateBranchName(branch);
    if (!check.ok) errors.from = check.error;
  }
  if (draft.from?.kind === "issue" && !draft.from.key.trim()) errors.from = CANNOT_CREATE_FROM_ISSUE;
  if (!name.ok || !draft.repoId || Object.keys(errors).length > 0) return { ok: false, errors };

  const naming = initialNaming({ name: name.value, prefix, userSetName: draft.nameEdited, branch });
  if (branch === undefined && !validateBranchName(applyBranchPrefix(prefix, name.value)).ok) {
    return { ok: false, errors: { name: INVALID_WORKSPACE_NAME } };
  }
  const message = draft.firstMessage.trim();
  return {
    ok: true,
    request: {
      repoId: draft.repoId,
      naming,
      startPoint: branch ?? draft.baseBranch.trim(),
      targetBranch: draft.baseBranch.trim(),
      existingBranch: branch !== undefined,
      from: draft.from,
      firstSession: message ? { agent: draft.agent, model: draft.model, effort: draft.effort, message } : null,
    },
  };
}

/**
 * Local branch a PR is checked out on. A fork PR's head branch often shares a
 * name with an origin branch (a fork's `main`), which `create_workspace` would
 * check out instead of the PR, so fork PRs get `<owner>/<branch>`.
 */
export function prBranchName(pr: Extract<CreateFrom, { kind: "pr" }>): string {
  const owner = pr.headOwner?.trim();
  return pr.crossRepository && owner ? `${owner}/${pr.headBranch}` : pr.headBranch;
}

// ---------------------------------------------------------------------------
// Lifecycle: initializing -> setting_up -> ready

/** `workspaces.state` values this flow writes. */
export type WorkspaceState = "initializing" | "setting_up" | "ready" | "failed";

export type CreateProgress =
  | { step: "idle" }
  | { step: "creating" }
  | { step: "detecting_setup"; workspaceId: string }
  /**
   * The dialog's last step. When `setupStarted`, the setup script now runs in
   * the backend (scripts crate); its log and outcome live in the workspace's
   * Setup tab and `setupWatch`, not here.
   */
  | { step: "ready"; workspaceId: string; setupStarted: boolean }
  | { step: "failed"; error: string };

export type CreateEvent =
  | { type: "submit" }
  | { type: "created"; workspaceId: string }
  | { type: "create_failed"; error?: string }
  /** `scripts_config` answered; `started` is what `setup_script_start` returned (false with no script). */
  | { type: "setup_detected"; started: boolean };

export const FAILED_TO_CREATE = "Failed to create workspace";

export function progressLabel(p: CreateProgress): string {
  switch (p.step) {
    case "idle":
      return "";
    case "creating":
      return "Creating workspace...";
    case "detecting_setup":
      return "Detecting setup script...";
    case "ready":
      return p.setupStarted ? RUNNING_SETUP : "Ready";
    case "failed":
      return p.error;
  }
}

export const RUNNING_SETUP = "Running setup script...";

/** The `workspaces.state` that matches a progress step. */
export function workspaceState(p: CreateProgress): WorkspaceState | null {
  switch (p.step) {
    case "creating":
      return "initializing";
    case "detecting_setup":
      return "setting_up";
    case "ready":
      // A started setup script keeps the workspace in setting_up until setupFinished.
      return p.setupStarted ? "setting_up" : "ready";
    case "failed":
      return "failed";
    case "idle":
      return null;
  }
}

/** Folds one backend event into the progress. Events that do not fit the current step are ignored. */
export function reduceProgress(p: CreateProgress, e: CreateEvent): CreateProgress {
  switch (e.type) {
    case "submit":
      return p.step === "idle" || p.step === "failed" ? { step: "creating" } : p;
    case "created":
      return p.step === "creating" ? { step: "detecting_setup", workspaceId: e.workspaceId } : p;
    case "create_failed":
      return p.step === "creating" ? { step: "failed", error: e.error?.trim() || FAILED_TO_CREATE } : p;
    case "setup_detected":
      return p.step === "detecting_setup" ? { step: "ready", workspaceId: p.workspaceId, setupStarted: e.started } : p;
  }
}

/** Arguments of the Rust `create_workspace` command (workspace lifecycle, #17). */
export interface CreateWorkspaceArgs {
  repositoryId: string;
  branchName: string;
  directoryName: string;
  baseBranch: string;
  /**
   * Check out `branchName` as it is (the local branch, or a local tracking copy
   * of `origin/<branchName>`) instead of creating it from `baseBranch` (#106).
   */
  existingBranch: boolean;
  /**
   * The PR being checked out. When the branch is neither local nor on origin
   * (a fork PR), the backend fetches `pull/<prNumber>/head` into it (#197).
   */
  prNumber?: number;
}

/**
 * Maps a request onto `create_workspace`. Create from a PR or branch sends
 * `existingBranch: true`, so the backend checks that branch out rather than
 * refusing it as taken. A PR also sends `prNumber`, so a fork PR's head is
 * fetched from `pull/<N>/head`.
 */
export function toCreateWorkspaceArgs(r: CreateRequest): CreateWorkspaceArgs {
  return {
    repositoryId: r.repoId,
    branchName: r.naming.branch,
    directoryName: r.naming.workspace_name,
    baseBranch: r.startPoint,
    existingBranch: r.existingBranch,
    ...(r.from?.kind === "pr" ? { prNumber: r.from.number } : {}),
  };
}
