import { useId, type ReactNode } from "react";
import { DialogFrame } from "./DialogFrame";
import { CornerDownLeftIcon } from "./menu/menuIcons";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  dismissWhilePending?: boolean;
  destructive?: boolean;
  primaryShortcut?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmationDialog({ title, children, confirmLabel, pendingLabel, pending = false, dismissWhilePending = false, destructive = false, primaryShortcut = true, onConfirm, onClose }: Props) {
  const id = useId();
  return (
    <DialogFrame kind="alert" className="project-confirmation" titleId={`${id}-title`} descriptionId={`${id}-description`} onClose={() => { if (!pending || dismissWhilePending) onClose(); }}>
      <div className="project-confirmation-header">
        <h2 id={`${id}-title`}>{title}</h2>
        <div id={`${id}-description`} className="project-confirmation-body">{children}</div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" data-dialog-cancel disabled={pending} onClick={onClose}>Cancel</button>
        <button type="button" className={`btn ${destructive ? "btn-danger" : "btn-primary"}`} data-primary-action={primaryShortcut || undefined} disabled={pending} onClick={onConfirm}>
          {pending ? pendingLabel ?? confirmLabel : confirmLabel}
          {!pending && primaryShortcut && <span className="project-confirmation-kbd">⌘<CornerDownLeftIcon /></span>}
        </button>
      </div>
    </DialogFrame>
  );
}
