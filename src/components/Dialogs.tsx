import type { KeyboardEventHandler, ReactNode } from "react";
import { CloseIcon } from "./Icons";
import { useDialogMotion } from "./motion/dialogMotion";

export type DialogKind = "clone" | "quickstart" | "create";

/**
 * `dialogId` tags the dialog for the keybinding dispatcher (`enableOnDialogIds`).
 * `motion`: "dialog" for Conductor's DialogContent (fade), "alert" for its
 * AlertDialogContent confirmations (fade and scale from .95).
 */
export function Modal({ title, onClose, children, dialogId, motion = "dialog", disablePointerDismissal = false, onKeyDown }: { title: string; onClose: () => void; children: ReactNode; dialogId?: string; motion?: "dialog" | "alert"; disablePointerDismissal?: boolean; onKeyDown?: KeyboardEventHandler<HTMLDivElement> }) {
  const ref = useDialogMotion<HTMLDivElement>();
  return (
    <div className="modal-backdrop" ref={ref} data-dialog-motion={motion} data-dialog-id={dialogId} onMouseDown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (disablePointerDismissal) e.preventDefault();
      else onClose();
    }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => {
        if (onKeyDown) {
          onKeyDown(e);
          if (e.defaultPrevented) return;
        }
        if (e.key === "Escape") onClose();
      }}>
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
