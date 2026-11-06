import type { ReactNode } from "react";
import { CloseIcon } from "./Icons";
import { useDialogMotion } from "./motion/dialogMotion";

export type DialogKind = "clone" | "quickstart" | "create";

/**
 * `motion`: "dialog" for Conductor's DialogContent (fade), "alert" for its
 * AlertDialogContent confirmations (fade and scale from .95).
 */
export function Modal({ title, onClose, children, motion = "dialog" }: { title: string; onClose: () => void; children: ReactNode; motion?: "dialog" | "alert" }) {
  const ref = useDialogMotion<HTMLDivElement>();
  return (
    <div className="modal-backdrop" ref={ref} data-dialog-motion={motion} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
