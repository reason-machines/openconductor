// parity:diff.discard:ui
import { useState } from "react";
import { Modal } from "../../components/Dialogs";
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

/** Confirm before discarding one file's changes; Cmd/Ctrl+Enter confirms, Escape cancels. */
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
    <Modal title="Discard file changes?" onClose={onClose}>
      <div
        className="modal-body"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <p>
          Discard all changes to <span className="oc-discard-path">{file.path}</span>? This action cannot be undone.
        </p>
        {error && <p className="error small">Couldn't discard: {error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn oc-btn-danger" onClick={confirm} disabled={busy} autoFocus title="Discard (⌘↵)">
            {busy ? "Discarding…" : "Discard"} <span className="muted">⌘↵</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
