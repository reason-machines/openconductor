// Conductor's quit confirm (`y5a` in renderApp-D_fmY7hW.js @ ~11,072,003): a
// title, the running-agents line, Cancel, and a destructive Quit with ⌘↵ that
// `dialog.primaryAction` also confirms.
import { ConfirmationDialog } from "../../components/ConfirmationDialog";
import { QUIT_DIALOG as COPY } from "./quit.ts";

export function QuitDialog({ running, onConfirm, onClose }: { running: number | undefined; onConfirm: () => void; onClose: () => void }) {
  const confirm = () => {
    onClose();
    onConfirm();
  };
  return (
    <ConfirmationDialog title={COPY.title} confirmLabel={COPY.confirmLabel} destructive onConfirm={confirm} onClose={onClose}>
      <p>{COPY.description(running)}</p>
    </ConfirmationDialog>
  );
}
