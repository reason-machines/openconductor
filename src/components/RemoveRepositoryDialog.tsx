import { useState } from "react";
import type { Repo } from "../state/types";
import { Modal } from "./Dialogs";
import { removeRepository } from "../settings/repoMisc";

interface Props {
  repo: Repo;
  onClose: () => void;
  /** After `db_remove_repo` succeeded. */
  onRemoved: () => void;
  onError: (message: string) => void;
}

/**
 * "Remove <repo>?" confirmation, shared by Settings › repository › Misc (`J3a`) and the
 * sidebar repository menu's Remove repository (Conductor's `Dra` AlertDialog: title, the
 * two paragraphs, Cancel and a destructive Remove that reads "Removing..." while pending).
 */
export function RemoveRepositoryDialog({ repo, onClose, onRemoved, onError }: Props) {
  const [pending, setPending] = useState(false);
  const remove = () => {
    setPending(true);
    removeRepository(repo.id).then(
      () => {
        setPending(false);
        onRemoved();
      },
      (e) => {
        setPending(false);
        onError(`Failed to remove repository: ${e instanceof Error ? e.message : String(e)}`);
      },
    );
  };
  return (
    <Modal title={`Remove ${repo.name}?`} onClose={() => !pending && onClose()} motion="alert">
      <div className="modal-body">
        <p>All your workspaces will be permanently deleted.</p>
        <p className="settings-misc-break">The source directory {repo.path} will not be modified.</p>
        <div className="modal-actions">
          <button className="btn" disabled={pending} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-danger" autoFocus disabled={pending} onClick={remove}>
            {pending ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
