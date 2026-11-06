import { useState } from "react";
import type { Repo } from "../state/types";
import { ConfirmationDialog } from "./ConfirmationDialog";
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
    <ConfirmationDialog title={`Remove ${repo.name}?`} confirmLabel="Remove" pendingLabel="Removing..." pending={pending} destructive primaryShortcut={false} onClose={onClose} onConfirm={remove}>
      <p>All your workspaces will be permanently deleted.</p>
      <p className="settings-misc-break">The source directory {repo.path} will not be modified.</p>
    </ConfirmationDialog>
  );
}
