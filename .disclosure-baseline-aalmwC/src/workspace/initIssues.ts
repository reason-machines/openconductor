// Non-fatal problems while a workspace was initialized (Conductor's qYe,
// see evidence/create-workspace/README.md "Initialization log"): the
// worktree exists, but `git worktree add` reported a failure (a post-checkout
// hook), push upstream could not be configured, or files could not be
// copied. The backend joins them into `auxiliaryFailureMessage`; Conductor
// raises it as a workspace error that stays until dismissed, with "View logs"
// opening the worktree-creation log when there is one.

export const VIEW_LOGS = "View logs";

/** The backend's message when `git worktree add` failed but the worktree exists. */
export const WORKTREE_PARTIAL_FAILURE = "Something failed while creating your workspace. Check the logs to see what went wrong.";

export interface InitIssue {
  workspaceId: string;
  message: string;
  /** `initializationLogPath`; without one the toast has no "View logs". */
  logPath: string | null;
}

/** The fields of `create_workspace`'s result this reads. */
export interface InitResult {
  workspace: { id: string };
  auxiliaryFailureMessage?: string | null;
  initializationLogPath?: string | null;
}

export function initIssue(created: InitResult): InitIssue | null {
  const message = created.auxiliaryFailureMessage?.trim();
  if (!message) return null;
  return { workspaceId: created.workspace.id, message, logPath: created.initializationLogPath || null };
}

type Listener = (issue: InitIssue) => void;
const listeners = new Set<Listener>();
let pending: InitIssue[] = [];

/** Called by `createWorkspace`; held until a listener mounts so none is lost. */
export function reportInitIssue(created: InitResult): InitIssue | null {
  const issue = initIssue(created);
  if (!issue) return null;
  if (listeners.size === 0) pending.push(issue);
  for (const l of listeners) l(issue);
  return issue;
}

export function subscribeInitIssues(listener: Listener): () => void {
  listeners.add(listener);
  const held = pending;
  pending = [];
  for (const issue of held) listener(issue);
  return () => {
    listeners.delete(listener);
  };
}
