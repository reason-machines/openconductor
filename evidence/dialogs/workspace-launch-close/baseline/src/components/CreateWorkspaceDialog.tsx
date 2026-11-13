import { useCallback, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { CreateWorkspaceComposer, type CreateWorkspaceComposerProps } from "./CreateWorkspaceComposer";
import { useDialogMotion } from "./motion/dialogMotion";

type Props = Omit<CreateWorkspaceComposerProps, "eyebrowVariant" | "onBusyChange">;

/**
 * "New workspace": Conductor's create dialog (`pya`), a borderless panel
 * anchored to the top of the window that holds only the composer, with its
 * title and description for screen readers. Escape or a click outside
 * closes it, except while the workspace is being created.
 */
export function CreateWorkspaceDialog(props: Props) {
  const [busy, setBusy] = useState(false);
  const ref = useDialogMotion<HTMLDivElement>();
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const close = useCallback(() => {
    if (!busy) props.onClose();
  }, [busy, props]);
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <div className="modal-backdrop create-backdrop" ref={ref} data-dialog-motion="dialog" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <Dialog.Popup
            initialFocus={false}
            finalFocus={returnFocus}
            className="create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-dialog-title"
            aria-describedby="create-dialog-description"
            onKeyDown={(e) => {
              if (e.key !== "Escape" || e.defaultPrevented) return;
              e.preventDefault();
              close();
            }}
          >
            <h2 id="create-dialog-title" className="sr-only">New workspace</h2>
            <p id="create-dialog-description" className="sr-only">Draft the first message, then create and send it.</p>
            <CreateWorkspaceComposer {...props} eyebrowVariant="attached" onBusyChange={setBusy} />
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
