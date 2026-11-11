// parity:chat.revert-checkpoint:ui
// Conductor's "Reset chat?" dialog (ResetChatToTurnDialog in its frontend):
// "Later messages will be deleted.", an "Also reset files" checkbox that is on
// by default and remembered, the number of files that differ from the turn's
// end checkpoint, Cancel, and a destructive "Reset ⌘↵" that reads
// "Resetting..." while it runs. Conductor reports a failure in a toast
// ("Failed to reset chat: …") and keeps the dialog open; the chat panel has no
// toast host, so the same text shows in the dialog.

import { useEffect, useState } from "react";
import { CornerDownLeftIcon } from "../../components/menu/menuIcons";
import { useDialogMotion } from "../../components/motion/dialogMotion";
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
  const motionRef = useDialogMotion<HTMLDivElement>();

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

  // Conductor's AlertDialog (renderApp @~1,984,000 bytes, `Im`/`Rm`/`Nm`/`Ag`/`Dm`): a centred
  // `max-w-lg gap-4 p-6 rounded-xl` panel over `bg-overlay backdrop-blur-xs`, no close button,
  // header `space-y-2` (text-lg title, text-sm muted description), footer `justify-end space-x-2`
  // with an outline Cancel and a destructive Reset.
  return (
    <div className="modal-backdrop oc-alert-backdrop" ref={motionRef} data-dialog-motion="alert">
      <div
        className="oc-alert oc-reset-chat"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-chat-title"
        aria-describedby="reset-chat-desc"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <div className="oc-alert-header">
          <h2 id="reset-chat-title">Reset chat?</h2>
          <p id="reset-chat-desc">Later messages will be deleted.</p>
        </div>
        <label className="oc-reset-files">
          <input type="checkbox" aria-label="Also reset files" checked={resetFiles} onChange={(e) => toggle(e.target.checked)} />
          <span>Also reset files</span>
          {count.state === "pending" ? <span className="oc-skeleton" aria-hidden /> : null}
          {count.state === "success" ? <span className="muted oc-reset-count">{count.n} changed</span> : null}
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="oc-alert-footer">
          <button type="button" className="oc-alert-btn oc-alert-cancel" onClick={onClose} autoFocus>
            Cancel
          </button>
          <button type="button" className="oc-alert-btn oc-alert-destructive" data-primary-action onClick={confirm} disabled={busy} title="Reset (⌘↵)">
            {busy ? "Resetting..." : "Reset"} {busy ? null : (
              // Conductor: `ml-2 inline-flex items-center opacity-60` with "⌘" and its 12px Enter icon (`gf`).
              <span className="oc-alert-kbd">
                ⌘<CornerDownLeftIcon className="oc-alert-enter" />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
