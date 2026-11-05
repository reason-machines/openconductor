// parity:sidebar.archive:ui / parity:sidebar.archived-view:ui
// The app's one archive and unarchive flow (rules in archive.ts). App owns it
// and hands `requestArchive` to the sidebar row menu, the workspace header,
// the palette and Cmd+Shift+A, and `unarchive` to the palette's archived list.
import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import { Modal } from "../components/Dialogs";
import type { ToastAction } from "../components/toastTiming";
import { chatSnapshot, stopChat } from "../features/chat/reasonChat";
import { inTauri } from "../backend";
import { startSetup } from "../scripts/api";
import { workspaceRef } from "../scripts/model";
import { loadReposFromDb, type Action } from "../state/store";
import type { AppState } from "../state/types";
import { unwatchSetup, watchSetup } from "./setupWatch";
import {
  ARCHIVE_ANYWAY_LABEL,
  ARCHIVE_DIALOG,
  GIT_OPERATION_WARNING,
  afterArchiveError,
  archiveWorkspace,
  failedToUnarchive,
  rememberBrowserArchived,
  toArchiveError,
  unarchiveWorkspace,
  type ArchiveMode,
} from "./archive";

type Notify = (kind: "error" | "info", message: string, opts?: { sticky?: boolean; action?: ToastAction }) => void;

interface Target {
  repoId: string;
  workspaceId: string;
}

/** The workspace's own chat has a turn running (Conductor: a session working, cancelling or waiting). */
const agentRunning = (workspaceId: string) => chatSnapshot(workspaceId).transcript.activeTurn !== null;

export function useArchiveFlow(state: AppState, dispatch: Dispatch<Action>, notify: Notify) {
  const [confirming, setConfirming] = useState<Target | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * Archive through the backend and drop the row from the sidebar; cleanup
   * warnings become toasts. Rejects with an `ArchiveError` and shows nothing
   * else (archive on merge words its own failure).
   */
  const archiveQuietly = useCallback(
    async ({ repoId, workspaceId }: Target, mode: ArchiveMode = "safe"): Promise<void> => {
      const repo = stateRef.current.repos.find((r) => r.id === repoId);
      const ws = repo?.workspaces.find((w) => w.id === workspaceId);
      let out;
      try {
        out = await archiveWorkspace(workspaceId, mode);
      } catch (e) {
        const err = toArchiveError(e);
        throw Object.assign(new Error(err.message), { code: err.code });
      }
      if (!inTauri() && ws) rememberBrowserArchived({ id: ws.id, repoId, name: ws.name, branch: ws.branch, createdAt: ws.createdAt });
      dispatch({ type: "archiveWorkspace", repoId, workspaceId });
      for (const w of out.warnings) notify("error", w, { sticky: true });
    },
    [dispatch, notify],
  );

  /** Archive now, without the running-agents question; a failure becomes a toast. */
  const archiveNow = useCallback(
    async ({ repoId, workspaceId }: Target, mode: ArchiveMode = "safe"): Promise<void> => {
      try {
        await archiveQuietly({ repoId, workspaceId }, mode);
      } catch (e) {
        const step = afterArchiveError(toArchiveError(e), mode);
        if (step.kind === "confirmDiscard") {
          notify("info", GIT_OPERATION_WARNING, {
            sticky: true,
            action: { label: ARCHIVE_ANYWAY_LABEL, onClick: () => void archiveNow({ repoId, workspaceId }, "discardGitOperationState") },
          });
          return;
        }
        notify("error", step.message);
      }
    },
    [archiveQuietly, notify],
  );

  /** Archive, asking first while the workspace's agent is running. */
  const requestArchive = useCallback(
    (repoId: string, workspaceId: string) => {
      if (agentRunning(workspaceId)) setConfirming({ repoId, workspaceId });
      else void archiveNow({ repoId, workspaceId });
    },
    [archiveNow],
  );

  /** Restore an archived workspace, open it and start its setup script. */
  const unarchive = useCallback(
    async (workspaceId: string) => {
      try {
        const { workspace: row, warning } = await unarchiveWorkspace(workspaceId);
        if (inTauri()) {
          const collapsed = stateRef.current.repos.filter((r) => r.collapsed).map((r) => r.id);
          dispatch({ type: "hydrate", repos: await loadReposFromDb(collapsed) });
        } else {
          dispatch({ type: "addWorkspace", repoId: row.repositoryId, workspace: { id: row.id, name: row.workspaceName ?? row.directoryName, branch: row.branch, number: row.number } });
        }
        dispatch({ type: "select", selection: { kind: "workspace", repoId: row.repositoryId, workspaceId: row.id } });
        if (warning) notify("error", warning, { sticky: true });
        const repo = stateRef.current.repos.find((r) => r.id === row.repositoryId);
        const ref = repo && workspaceRef(repo, { id: row.id, name: row.directoryName, path: row.workspacePath ?? undefined });
        if (inTauri() && ref) {
          watchSetup(row.id);
          const started = await startSetup(ref).catch(() => false);
          if (!started) unwatchSetup(row.id);
        }
      } catch (e) {
        notify("error", failedToUnarchive(e instanceof Error ? e.message : String(e)), { sticky: true });
      }
    },
    [dispatch, notify],
  );

  const dialog = confirming && (
    <ArchiveConfirmDialog
      onClose={() => setConfirming(null)}
      onConfirm={() => {
        setConfirming(null);
        stopChat(confirming.workspaceId);
        void archiveNow(confirming);
      }}
    />
  );

  return { requestArchive, archiveQuietly, unarchive, dialog };
}

export type ArchiveFlow = ReturnType<typeof useArchiveFlow>;

/** Conductor's running-agents confirmation: Cancel, then the destructive "Stop agents and archive ⌘↵". */
export function ArchiveConfirmDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={ARCHIVE_DIALOG.title} onClose={onClose}>
      <div
        className="modal-body"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onConfirm();
          }
        }}
      >
        <p>{ARCHIVE_DIALOG.description}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {ARCHIVE_DIALOG.cancelLabel}
          </button>
          <button className="btn oc-btn-danger" onClick={onConfirm} autoFocus data-primary-action>
            {ARCHIVE_DIALOG.confirmLabel} <span className="muted">⌘↵</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
