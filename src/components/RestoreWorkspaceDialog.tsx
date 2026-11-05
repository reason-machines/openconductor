// parity:sidebar.archived-view:ui
// Conductor's `restore-workspace-dialog` (renderApp `m6a` @ ~10,958,000):
// opened when unarchive finds the workspace's branch deleted, checked out by
// another workspace, or moved since the archive. "Restore to new branch"
// unarchives onto a new, uniquely named branch from the archive commit.
import { useEffect, useState, type Dispatch } from "react";
import { Modal } from "./Dialogs";
import type { Action } from "../state/store";
import { RESTORE_DIALOG_LABELS as L, onArchiveEvent, restoreDialogCopy, type RestoreScenario } from "../workspace/archive";

export interface RestoreRequest {
  repoId: string;
  workspaceId: string;
  branch: string;
  scenario: RestoreScenario;
}

export function RestoreWorkspaceDialog({ request, dispatch, onClose }: { request: RestoreRequest; dispatch: Dispatch<Action>; onClose: () => void }) {
  const { title, body } = restoreDialogCopy(request.scenario, request.branch);
  const [pending, setPending] = useState(false);
  useEffect(
    () =>
      onArchiveEvent<Action>((e) => {
        if (e.action.type !== "unarchiveWorkspace" || e.action.workspaceId !== request.workspaceId || !e.action.useNewBranch) return;
        if (e.type === "unarchived" && e.result.restored) onClose();
        if (e.type === "unarchive-failed" || e.type === "unarchived") setPending(false);
      }),
    [request.workspaceId, onClose],
  );
  const confirm = () => {
    setPending(true);
    dispatch({ type: "unarchiveWorkspace", repoId: request.repoId, workspaceId: request.workspaceId, useNewBranch: true });
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div
        className="modal-body"
        data-testid="restore-workspace-dialog"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !pending) confirm();
        }}
      >
        <p className="break-words">{body}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={pending}>
            {L.cancel}
          </button>
          <button className="btn btn-primary" autoFocus onClick={confirm} disabled={pending}>
            {pending ? L.pending : L.confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}
