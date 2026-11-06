import { useRef, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../keybindings/overrides";
import { matchesEvent } from "../keybindings/shortcut";
import { useDialogMotion } from "./motion/dialogMotion";
import "./dialogFrame.css";

type Props = {
  kind: "dialog" | "alert";
  titleId: string;
  descriptionId?: string;
  className?: string;
  blur?: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function DialogFrame({ kind, titleId, descriptionId, className = "", blur = true, onClose, children }: Props) {
  const { overrides } = useKeybindingOverrides();
  const motionRef = useDialogMotion<HTMLDivElement>();
  const popup = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const Parts = kind === "alert" ? AlertDialog : Dialog;
  return (
    <Parts.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Parts.Portal>
        <div className="project-dialog-layer" ref={motionRef} data-dialog-id={`project-${kind}`} data-dialog-motion={kind}>
          <Parts.Backdrop className={`project-dialog-backdrop${blur ? "" : " project-dialog-no-blur"}`} />
          <div className={`project-dialog-viewport project-dialog-${kind}`}>
            <Parts.Popup
              ref={popup}
              className={`modal project-dialog ${className}`}
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descriptionId}
              initialFocus={() => popup.current?.querySelector<HTMLElement>(kind === "alert" ? "[data-dialog-cancel]" : "input:not([disabled]), button:not([disabled])")}
              finalFocus={returnFocus}
              onKeyDown={(event) => {
                if (event.defaultPrevented || event.nativeEvent.isComposing) return;
                if (!effectiveShortcuts("dialog.primaryAction", overrides).some((key) => matchesEvent(key, event.nativeEvent))) return;
                event.preventDefault();
                popup.current?.querySelector<HTMLButtonElement>("[data-primary-action]:not([disabled])")?.click();
              }}
            >
              {children}
            </Parts.Popup>
          </div>
        </div>
      </Parts.Portal>
    </Parts.Root>
  );
}
