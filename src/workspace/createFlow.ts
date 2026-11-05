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
  | { kind: "pr"; number: number; title: string; headBranch: string; baseBranch: string }
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
  if (draft.from?.kind === "pr") branch = draft.from.headBranch;
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

// ---------------------------------------------------------------------------
// Lifecycle: initializing -> setting_up -> ready

/** `workspaces.state` values this flow writes. */
export type WorkspaceState = "initializing" | "setting_up" | "ready" | "failed";

export type CreateProgress =
  | { step: "idle" }
  | { step: "creating" }
  | { step: "detecting_setup"; workspaceId: string }
  | { step: "running_setup"; workspaceId: string; log: string[] }
  | { step: "setup_failed"; workspaceId: string; exitCode: number | null; log: string[] }
  | { step: "ready"; workspaceId: string; ranSetup: boolean }
  | { step: "failed"; error: string };

export type CreateEvent =
  | { type: "submit" }
  | { type: "created"; workspaceId: string }
  | { type: "create_failed"; error?: string }
  | { type: "setup_detected"; hasScript: boolean }
  | { type: "setup_output"; line: string }
  | { type: "setup_exited"; exitCode: number | null }
  | { type: "retry_setup" };

export const FAILED_TO_CREATE = "Failed to create workspace";
const LOG_LIMIT = 500;

export function progressLabel(p: CreateProgress): string {
  switch (p.step) {
    case "idle":
      return "";
    case "creating":
      return "Creating workspace...";
    case "detecting_setup":
      return "Detecting setup script...";
    case "running_setup":
      return "Running setup script...";
    case "setup_failed":
      return "Setup script failed";
    case "ready":
      return "Ready";
    case "failed":
      return p.error;
  }
}

/** The `workspaces.state` that matches a progress step. */
export function workspaceState(p: CreateProgress): WorkspaceState | null {
  switch (p.step) {
    case "creating":
      return "initializing";
    case "detecting_setup":
    case "running_setup":
      return "setting_up";
    case "ready":
    case "setup_failed":
      // A failed setup script leaves a usable workspace; the failure is shown, not fatal.
      return "ready";
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
      if (p.step !== "detecting_setup") return p;
      return e.hasScript
        ? { step: "running_setup", workspaceId: p.workspaceId, log: [] }
        : { step: "ready", workspaceId: p.workspaceId, ranSetup: false };
    case "setup_output":
      return p.step === "running_setup" ? { ...p, log: [...p.log, e.line].slice(-LOG_LIMIT) } : p;
    case "setup_exited":
      if (p.step !== "running_setup") return p;
      return e.exitCode === 0
        ? { step: "ready", workspaceId: p.workspaceId, ranSetup: true }
        : { step: "setup_failed", workspaceId: p.workspaceId, exitCode: e.exitCode, log: p.log };
    case "retry_setup":
      return p.step === "setup_failed" ? { step: "running_setup", workspaceId: p.workspaceId, log: [] } : p;
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
}

/**
 * Maps a request onto `create_workspace`. Create from a PR or branch sends
 * `existingBranch: true`, so the backend checks that branch out rather than
 * refusing it as taken. A fork PR's branch is not on origin and comes back as
 * "branch not found locally or on origin".
 */
export function toCreateWorkspaceArgs(r: CreateRequest): CreateWorkspaceArgs {
  return {
    repositoryId: r.repoId,
    branchName: r.naming.branch,
    directoryName: r.naming.workspace_name,
    baseBranch: r.startPoint,
    existingBranch: r.existingBranch,
  };
}
