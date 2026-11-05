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
}

/** The rejection value of `archive_workspace` and `unarchive_workspace`. */
export interface ArchiveFailure {
  code: "WORKSPACE_CORRUPTED" | "WorkspaceArchiveBlockedByGitOperationError" | "ArchiveFailed" | string;
  message: string;
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
export const CORRUPTED_MESSAGE = "Archiving failed. This workspace might be corrupted.";

/** Conductor's `vfe`: a session that is working, cancelling or waiting blocks archive. */
export function blockedByAgents(status: string | undefined, stopRunningAgents: boolean | undefined): boolean {
  return status === "working" && !stopRunningAgents;
}

export type FailureToast =
  | { kind: "git-operation"; message: string }
  | { kind: "error"; message: string };

/** What to show for a failed archive in `mode` (Conductor's `onError`). */
export function failureToast(err: unknown, mode: ArchiveMode = "safe"): FailureToast {
  const f = asFailure(err);
  if (f.code === "WorkspaceArchiveBlockedByGitOperationError" && mode !== "discardGitOperationState") {
    return { kind: "git-operation", message: GIT_OPERATION_WARNING };
  }
  if (f.code === "WORKSPACE_CORRUPTED") return { kind: "error", message: CORRUPTED_MESSAGE };
  return { kind: "error", message: f.message };
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
