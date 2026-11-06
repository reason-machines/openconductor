import type { ReactNode } from "react";
import { CloseIcon } from "./Icons";

export type DialogKind = "clone" | "quickstart" | "create";

/** `dialogId` tags the dialog for the keybinding dispatcher (`enableOnDialogIds`). */
export function Modal({ title, onClose, children, dialogId }: { title: string; onClose: () => void; children: ReactNode; dialogId?: string }) {
  return (
    <div className="modal-backdrop" data-dialog-id={dialogId} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
