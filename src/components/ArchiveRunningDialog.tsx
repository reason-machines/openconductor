// parity:sidebar.archive:ui
// Conductor's `archive-running-workspace` dialog (renderApp @ ~10,888,626):
// shown when Archive is chosen while an agent is still running.
import { ConfirmationDialog } from "./ConfirmationDialog";
import { RUNNING_AGENTS_DIALOG as COPY } from "../workspace/archive";

export function ArchiveRunningDialog({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <ConfirmationDialog title={COPY.title} confirmLabel={COPY.confirmLabel} destructive onClose={onClose} onConfirm={() => { onClose(); onConfirm(); }}>
      <p>{COPY.description}</p>
    </ConfirmationDialog>
  );
}
