// parity:chat.revert-checkpoint:ui
// Conductor's "Reset chat?" dialog (ResetChatToTurnDialog in its frontend):
// "Later messages will be deleted.", an "Also reset files" checkbox that is on
// by default and remembered, the number of files that differ from the turn's
// end checkpoint, Cancel, and a destructive "Reset ⌘↵" that reads
// "Resetting..." while it runs. Conductor reports a failure in a toast
// ("Failed to reset chat: …") and keeps the dialog open; the chat panel has no
// toast host, so the same text shows in the dialog.

import { useEffect, useState } from "react";
import { Modal } from "../../components/Dialogs";
import { RESET_FILES_KEY, parseResetFilesPreference } from "./checkpoints.ts";

interface Props {
  /** Files that differ from the turn's end checkpoint; a rejection hides the count. */
  loadChangedCount: () => Promise<number>;
  /** Runs the reset; a rejection keeps the dialog open with the error. */
  onConfirm: (resetFiles: boolean) => Promise<void>;
  onClose: () => void;
}

function readPreference(): boolean {
  try {
    return parseResetFilesPreference(localStorage.getItem(RESET_FILES_KEY));
  } catch {
    return true;
  }
}

export function ResetChatDialog({ loadChangedCount, onConfirm, onClose }: Props) {
  const [resetFiles, setResetFiles] = useState(readPreference);
  const [count, setCount] = useState<{ state: "pending" } | { state: "success"; n: number } | { state: "error" }>({ state: "pending" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadChangedCount().then(
      (n) => live && setCount({ state: "success", n }),
      () => live && setCount({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, []);

  const toggle = (on: boolean) => {
    setResetFiles(on);
    try {
      localStorage.setItem(RESET_FILES_KEY, String(on));
    } catch (e) {
      console.error("Failed to save reset files preference", e);
    }
  };

  const confirm = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    onConfirm(resetFiles).then(onClose, (e: unknown) => {
      setBusy(false);
      setError(`Failed to reset chat: ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  return (
    <Modal title="Reset chat?" onClose={onClose} motion="alert">
      <div
        className="modal-body oc-reset-chat"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <p>Later messages will be deleted.</p>
        <label className="oc-reset-files">
          <input type="checkbox" aria-label="Also reset files" checked={resetFiles} onChange={(e) => toggle(e.target.checked)} />
          <span>Also reset files</span>
          {count.state === "pending" ? <span className="oc-skeleton" aria-hidden /> : null}
          {count.state === "success" ? <span className="muted oc-reset-count">{count.n} changed</span> : null}
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn oc-btn-danger" onClick={confirm} disabled={busy} autoFocus title="Reset (⌘↵)">
            {busy ? "Resetting..." : "Reset"} {busy ? null : <span className="muted">⌘↵</span>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
