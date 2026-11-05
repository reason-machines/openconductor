// parity:sidebar.archive / parity:sidebar.archived-view
// Pure rules and copy of archive and unarchive (no Tauri imports, so node
// --test covers them). The flow is src/workspace/useArchiveFlow.tsx, the
// backend calls are archive.ts; behaviour and evidence are described there.
import type { DbWorkspaceRow } from "../state/persisted.ts";

/** Conductor's `Rze`: the dialog shown when agents are still running. */
export const ARCHIVE_DIALOG = {
  title: "Archive workspace?",
  description: "Agents are still running in this workspace. Archiving will stop them and end any in-progress work.",
  cancelLabel: "Cancel",
  confirmLabel: "Stop agents and archive",
} as const;

/** The sticky warning for a refused archive (`WorkspaceArchiveBlockedByGitOperationError`). */
export const GIT_OPERATION_WARNING =
  "Because a Git operation (merge, rebase, cherry-pick, or revert) is in progress, archiving may lose some of your work.";
/** Its button: archive anyway, dropping the operation's state. */
export const ARCHIVE_ANYWAY_LABEL = "Archive";

export const UNARCHIVE_LABEL = "Unarchive workspace";
export const VIEW_ARCHIVED_LABEL = "View archived workspaces";
export const ARCHIVE_FILTER_LABEL = "Archived workspaces";

export type ArchiveMode = "safe" | "discardGitOperationState";

/** What the palette's Workspaces tab shows (Conductor's `archiveFilter`). */
export type ArchiveFilter = "active" | "all" | "archived";
export const ARCHIVE_FILTERS: readonly ArchiveFilter[] = ["active", "all", "archived"];
export const ARCHIVE_FILTER_TEXT: Record<ArchiveFilter, string> = {
  active: "Hiding archived",
  all: "Showing all",
  archived: "Only archived",
};

export function matchesArchiveFilter(archived: boolean, filter: ArchiveFilter): boolean {
  return filter === "all" || (filter === "archived") === archived;
}

export const failedToUnarchive = (detail: string) => `Failed to unarchive: ${detail}`;

export interface ArchiveError {
  code: "gitBusy" | "failed";
  message: string;
}

/** The backend's `ArchiveErrorDto`, or any other rejection as "failed". */
export function toArchiveError(e: unknown): ArchiveError {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    const { code, message } = e as { code: unknown; message: unknown };
    return { code: code === "gitBusy" ? "gitBusy" : "failed", message: String(message) };
  }
  return { code: "failed", message: e instanceof Error ? e.message : String(e) };
}

/**
 * Next step after an archive attempt failed: a git operation in a safe-mode
 * attempt asks the user (warning with "Archive"); everything else is an error.
 */
export function afterArchiveError(err: ArchiveError, mode: ArchiveMode): { kind: "confirmDiscard" } | { kind: "error"; message: string } {
  if (err.code === "gitBusy" && mode === "safe") return { kind: "confirmDiscard" };
  return { kind: "error", message: err.message };
}

/** A row of the archived list. */
export interface ArchivedWorkspace {
  id: string;
  repoId: string;
  name: string;
  branch: string;
  createdAt: number;
}

/** SQLite `datetime('now')` text is UTC without a zone. */
const sqliteTime = (s: string) => Date.parse(s.includes("T") ? s : `${s.replace(" ", "T")}Z`) || 0;

/** Archived rows of `db_list_workspaces`, newest first. */
export function archivedFromRows(rows: readonly DbWorkspaceRow[]): ArchivedWorkspace[] {
  return rows
    .filter((w) => w.state === "archived")
    .map((w) => ({ id: w.id, repoId: w.repositoryId, name: w.workspaceName ?? w.directoryName, branch: w.branch, createdAt: sqliteTime(w.createdAt) }))
    .reverse();
}
