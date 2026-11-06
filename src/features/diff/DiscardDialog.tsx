// parity:diff.discard:ui
import { useState } from "react";
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import type { FileDiff } from "./types.ts";

/** Counter-clockwise arrow: the per-file revert action in the changes list and file header. */
export function RevertIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 6.5h6a3.5 3.5 0 0 1 0 7H6" />
      <path d="M6 3.5l-3 3 3 3" />
    </svg>
  );
}

interface Props {
  file: FileDiff;
  /** Runs the discard; a rejection is shown in the dialog. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function DiscardDialog({ file, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    onConfirm().then(onClose, (e: unknown) => {
      setBusy(false);
      setError(String(e));
    });
  };
  return (
    <ConfirmationDialog title="Discard file changes?" confirmLabel="Discard" pendingLabel="Discarding…" pending={busy} destructive onConfirm={confirm} onClose={onClose}>
      <p>
        Discard all changes to <span className="oc-discard-path">{file.path}</span>? This action cannot be undone.
      </p>
      {error && <p className="error small">Couldn't discard: {error}</p>}
    </ConfirmationDialog>
  );
}
