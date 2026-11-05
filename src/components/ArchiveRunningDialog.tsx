// parity:sidebar.archive:ui
// Conductor's `archive-running-workspace` dialog (renderApp @ ~10,888,900):
// shown when Archive is chosen while an agent is still running.
import { Modal } from "./Dialogs";
import { RUNNING_AGENTS_DIALOG as COPY } from "../workspace/archive";

export function ArchiveRunningDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={COPY.title} onClose={onClose}>
      <div className="modal-body">
        <p>{COPY.description}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {COPY.cancelLabel}
          </button>
          <button
            className="btn btn-danger"
            autoFocus
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {COPY.confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
