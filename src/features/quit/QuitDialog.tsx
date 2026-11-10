// Conductor's quit confirm (`y5a` in renderApp-D_fmY7hW.js @ ~11,072,003): a
// title, the running-agents line, Cancel, and a destructive Quit with ⌘↵ that
// `dialog.primaryAction` also confirms.
import { Modal } from "../../components/Dialogs";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { PRIORITY } from "../../keybindings/dispatcher.ts";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs } from "../../keybindings/shortcut.ts";
import { QUIT_DIALOG as COPY, QUIT_DIALOG_ID } from "./quit.ts";

export function QuitDialog({ running, onConfirm, onClose }: { running: number | undefined; onConfirm: () => void; onClose: () => void }) {
  const { overrides } = useKeybindingOverrides();
  const key = effectiveShortcuts("dialog.primaryAction", overrides)[0];
  const confirm = () => {
    onClose();
    onConfirm();
  };
  useKeybindings({ "dialog.primaryAction": confirm }, { priority: PRIORITY.DIALOG, enableOnDialogIds: [QUIT_DIALOG_ID] });
  return (
    <Modal title={COPY.title} onClose={onClose} dialogId={QUIT_DIALOG_ID} motion="alert" disablePointerDismissal>
      <div className="modal-body">
        <p>{COPY.description(running)}</p>
        <div className="modal-actions">
          <button className="btn" autoFocus onClick={onClose}>
            {COPY.cancelLabel}
          </button>
          <button className="btn btn-danger" data-primary-action onClick={confirm}>
            {COPY.confirmLabel}
            {key && <kbd className="quit-kbd">{glyphs(key)}</kbd>}
          </button>
        </div>
      </div>
    </Modal>
  );
}
