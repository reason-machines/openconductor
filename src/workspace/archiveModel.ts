// parity:sidebar.archive:ui
// Full archive (src-tauri/src/workspace_archive_commands.rs): its types and the
// UI decisions around it, as Conductor 0.87.6's archive mutation (index-BGEQ8YjU.js @ ~3,299,721):
// - agents still running: ask first ("Archive workspace?"), then archive with
//   `stopRunningAgents` (Conductor's WorkspaceHasRunningSessionsError);
// - a Git operation in progress: a sticky warning with an "Archive" button that
//   retries in `discardGitOperationState` mode;
// - a missing workspace directory: "Archiving failed. This workspace might be
//   corrupted. ..."; any other failure: its message, sticky.
// The row is hidden optimistically and comes back when the archive fails.
export type ArchiveMode = "safe" | "discardGitOperationState";

export interface ArchiveNotice {
  kind: "info" | "error";
  message: string;
}

export interface ArchiveResult {
  /** False when the row was already archived or an archive of it was already running. */
  archived: boolean;
  branch: string | null;
  archiveCommit: string | null;
  /** A failing archive script, a worktree that could not be removed, a branch not deleted. */
  notices: ArchiveNotice[];
}

/** What `unarchive_workspace` did. */
export interface UnarchiveResult {
  /** False when the row was not archived, or an archive or unarchive of it was already running. */
  restored: boolean;
  branch: string | null;
  /** The branch had been deleted on archive and was recreated at the archive commit. */
  recreatedBranch: boolean;
  /** Uncommitted work saved at archive time was put back. */
  restoredChanges: boolean;
  /** "Uncommitted changes couldn't be recovered: ..." */
  notices: ArchiveNotice[];
  /**
   * Set when nothing was restored because the branch cannot be used as it is
   * (Conductor's `CWt`): the UI then offers "Restore to new branch?".
   */
  scenario?: RestoreScenario | null;
}

/** Why the original branch cannot take the workspace back (Conductor's `CWt`). */
export type RestoreScenario = "branchDeleted" | "branchTaken" | "branchDiverged";

/** Conductor's restore-workspace-dialog copy (`u6a`, renderApp @ ~10,957,700). */
export function restoreDialogCopy(scenario: RestoreScenario, branch: string): { title: string; body: string } {
  const title = "Restore to new branch?";
  switch (scenario) {
    case "branchTaken":
      return { title, body: `This workspace was last on ${branch}, but that branch is being used by another workspace.` };
    case "branchDiverged":
      return { title, body: `This workspace was last on ${branch}, but someone updated that branch in the meantime. Restore to a new branch to preserve your work.` };
    case "branchDeleted":
      return { title, body: `This workspace was last on ${branch}, but that branch has been deleted or renamed.` };
  }
}

export const RESTORE_DIALOG_LABELS = { cancel: "Cancel", confirm: "Restore to new branch", pending: "Restoring..." } as const;

/** The rejection value of `archive_workspace` and `unarchive_workspace`. */
export interface ArchiveFailure {
  code: "WORKSPACE_CORRUPTED" | "WorkspaceArchiveBlockedByGitOperationError" | "UnarchiveDirectoryExists" | "ArchiveFailed" | string;
  message: string;
  /** `UnarchiveDirectoryExists`: the folder in the way and the workspace's directory name. */
  path?: string;
  directoryName?: string;
}

/** Conductor's "directory already exists" unarchive toast (`kIa`, renderApp @ ~11,582,900). */
export interface DirectoryExistsToast {
  title: string;
  description: string;
  clearLabel: "Clear & unarchive";
  openLabel: "Open in Finder";
  copyLabel: "Copy path";
  path: string;
}

/** The directory-exists toast for an unarchive failure, or null for any other failure. */
export function directoryExistsToast(err: unknown): DirectoryExistsToast | null {
  if (!err || typeof err !== "object") return null;
  const { code, path, directoryName } = err as { code?: unknown; path?: unknown; directoryName?: unknown };
  if (code !== "UnarchiveDirectoryExists" || typeof path !== "string") return null;
  const name = typeof directoryName === "string" && directoryName ? directoryName : path.split("/").pop() ?? path;
  return {
    title: `Failed to unarchive: ${name}`,
    description: `The folder at ${path} already exists.`,
    clearLabel: "Clear & unarchive",
    openLabel: "Open in Finder",
    copyLabel: "Copy path",
    path,
  };
}

/** Conductor's `archive-running-workspace` dialog copy (renderApp @ ~10,888,626). */
export const RUNNING_AGENTS_DIALOG = {
  title: "Archive workspace?",
  description: "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.",
  cancelLabel: "Cancel",
  confirmLabel: "Stop agents and archive",
} as const;

export const GIT_OPERATION_WARNING =
  "Because a Git operation (merge, rebase, cherry-pick, or revert) is in progress, archiving may lose some of your work.";
/** Conductor's `hv` toast (index @ ~3,302,400), with its "Delete permanently" button. */
export const CORRUPTED_MESSAGE = "Archiving failed. This workspace might be corrupted. Delete permanently?";
/** The archive failure toasts' delete buttons (Conductor's `Qk`). */
export const DELETE_PERMANENTLY_LABEL = "Delete permanently";
export const DELETE_ANYWAY_LABEL = "Delete anyway";

/**
 * Conductor's `dYe` (index-BGEQ8YjU.js @ ~966,533): any of the workspace's
 * visible sessions working, cancelling or waiting blocks archive. `status` is
 * the fold over every chat of the workspace (main, background and review
 * chats: `workspaceSessionStatus`), not only the open view's main chat.
 */
export function blockedByAgents(status: string | undefined, stopRunningAgents: boolean | undefined): boolean {
  return (status === "working" || status === "cancelling" || status === "waiting") && !stopRunningAgents;
}

export type FailureToast =
  | { kind: "git-operation"; message: string }
  /** `deleteLabel`: the button that deletes the workspace (row and folder). */
  | { kind: "error"; message: string; deleteLabel: string };

/** What to show for a failed archive in `mode` (Conductor's `onError`). */
export function failureToast(err: unknown, mode: ArchiveMode = "safe"): FailureToast {
  const f = asFailure(err);
  if (f.code === "WorkspaceArchiveBlockedByGitOperationError" && mode !== "discardGitOperationState") {
    return { kind: "git-operation", message: GIT_OPERATION_WARNING };
  }
  if (f.code === "WORKSPACE_CORRUPTED") return { kind: "error", message: CORRUPTED_MESSAGE, deleteLabel: DELETE_PERMANENTLY_LABEL };
  return { kind: "error", message: f.message, deleteLabel: DELETE_ANYWAY_LABEL };
}

function asFailure(err: unknown): ArchiveFailure {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const { code, message } = err as { code: unknown; message: unknown };
    return { code: String(code), message: String(message) };
  }
  return { code: "ArchiveFailed", message: err instanceof Error ? err.message : String(err) };
}

/** What `startArchive` needs from the store. */
export interface ArchiveStartDeps<A> {
  /** The workspace's sidebar status (`"working"` while its agent runs). */
  status: string | undefined;
  /** Hide the row (the store's reducer), optimistically. */
  hide: () => void;
  /**
   * Stop every chat turn running in the workspace. Conductor's `Z$` cancels all
   * of the workspace's sessions during the archive (index @ ~974,853); the chats
   * run in this frontend, so they are stopped here, before the backend call.
   */
  stopAgents: () => void;
  /** Run the archive; `null` outside the desktop app, where hiding is all there is. */
  run: ((mode: ArchiveMode) => Promise<ArchiveResult>) | null;
  /** Reload rows from conductor.db, bringing back a row whose archive failed. */
  reload: () => void;
  emit: (e: ArchiveEvent<A>) => void;
}

/**
 * The store's handling of an archive action, in the order of Conductor's
 * archive mutation: refuse over running agents (ask instead), hide the row,
 * archive, and on failure put the row back and report.
 */
export async function startArchive<A extends { mode?: ArchiveMode; stopRunningAgents?: boolean }>(
  action: A,
  d: ArchiveStartDeps<A>,
): Promise<void> {
  if (blockedByAgents(d.status, action.stopRunningAgents)) {
    d.emit({ type: "agents-running", action });
    return;
  }
  d.hide();
  d.stopAgents();
  if (!d.run) return;
  const mode = action.mode ?? "safe";
  try {
    const result = await d.run(mode);
    d.emit({ type: "archived", action, result });
  } catch (error) {
    d.reload();
    d.emit({ type: "failed", action, error, mode });
  }
}

/** What `startUnarchive` needs from the store. */
export interface UnarchiveStartDeps<A> {
  /** Put the row back (the store's reducer), optimistically. */
  show: () => void;
  /** Recreate the worktree; `null` outside the desktop app. */
  run: (() => Promise<UnarchiveResult>) | null;
  /** Rerun the setup script, as Conductor does after an unarchive (`needsSetupScript`). */
  setup: () => void;
  reload: () => void;
  emit: (e: ArchiveEvent<A>) => void;
}

/** Unarchive: show the row, recreate the worktree, rerun setup; on failure put the row away again. */
export async function startUnarchive<A>(action: A, d: UnarchiveStartDeps<A>): Promise<void> {
  d.show();
  if (!d.run) return;
  try {
    const result = await d.run();
    if (result.restored) d.setup();
    d.emit({ type: "unarchived", action, result });
  } catch (error) {
    d.reload();
    d.emit({ type: "unarchive-failed", action, error });
  }
}

/** Conductor's unarchive failure toast (`eU` @ ~3,311,139). */
export function unarchiveFailedMessage(err: unknown): string {
  return `Failed to unarchive: ${asFailure(err).message}`;
}

/** What happened to an archive or unarchive the store started, for the app shell to show. */
export type ArchiveEvent<A> =
  | { type: "agents-running"; action: A }
  | { type: "archived"; action: A; result: ArchiveResult }
  | { type: "failed"; action: A; error: unknown; mode: ArchiveMode }
  | { type: "unarchived"; action: A; result: UnarchiveResult }
  | { type: "unarchive-failed"; action: A; error: unknown };

type Listener<A> = (e: ArchiveEvent<A>) => void;
const listeners = new Set<Listener<unknown>>();

export function onArchiveEvent<A>(listener: Listener<A>): () => void {
  listeners.add(listener as Listener<unknown>);
  return () => listeners.delete(listener as Listener<unknown>);
}

export function emitArchiveEvent<A>(e: ArchiveEvent<A>): void {
  for (const l of listeners) l(e as ArchiveEvent<unknown>);
}
