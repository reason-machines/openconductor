import { useState, type KeyboardEvent } from "react";
import { MessageSquareTextIcon } from "./menu/menuIcons";
import { useDialogMotion } from "./motion/dialogMotion";

interface Props {
  currentTitle: string;
  /** Stores the new title; a rejection keeps the dialog open with the error toast. */
  onRename: (title: string) => Promise<void> | void;
  onClose: () => void;
  onError: (message: string) => void;
}

/**
 * "Rename chat" (Conductor's `Rya` in the `wxe` dialog, renderApp-D_fmY7hW.js @11,059,961,
 * read with REA as data): the same `max-w-sm` dialog as Rename workspace with a
 * message-square-text icon, an sr-only "Enter a new name for this chat", one field that
 * starts as the chat's title and selects itself on focus, Cancel and OK ("Renaming..."
 * while it saves). Enter submits; an empty or unchanged name just closes.
 */
export function RenameChatDialog({ currentTitle, onRename, onClose, onError }: Props) {
  const [value, setValue] = useState(currentTitle);
  const [pending, setPending] = useState(false);
  const motionRef = useDialogMotion<HTMLDivElement>();

  async function submit() {
    if (pending) return;
    const title = value.trim();
    if (!title || title === currentTitle) return onClose();
    setPending(true);
    try {
      await onRename(title);
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setPending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="modal-backdrop" ref={motionRef} data-dialog-motion="dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal rename-ws-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-chat-title" aria-describedby="rename-chat-desc" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="rename-chat-title" className="rename-ws-title">
          <MessageSquareTextIcon className="rename-chat-icon" />
          Rename chat
        </h2>
        <p id="rename-chat-desc" className="sr-only">
          Enter a new name for this chat
        </p>
        <input
          className="rename-ws-input"
          aria-label="Chat name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={onKeyDown}
          disabled={pending}
          autoFocus
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" data-primary-action onClick={() => void submit()} disabled={pending}>
            {pending ? "Renaming..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
