// parity:chat.tabs:rename
// Conductor's "Rename chat" dialog (REA-read renderApp-D_fmY7hW.js, `Iya`/`Rya`
// @11,059,961, opened from the chat tab menu `u8i`): a `max-w-sm` dialog whose
// title is the message-square-text icon (size-5) and "Rename chat", a screen
// reader description "Enter a new name for this chat", one text field holding
// the current title that selects itself on focus, then Cancel (ghost) and OK
// (primary; "Renaming..." while it saves). Enter submits; an empty or unchanged
// title just closes. A failed save shows Conductor's error toast and keeps the
// dialog open. Styled like the Rename workspace dialog it sits beside.

import { useState, type KeyboardEvent } from "react";
import { useDialogMotion } from "../../components/motion/dialogMotion";
import { MessageSquareTextIcon } from "../../components/menu/menuIcons";
import { renamedChatTitle } from "./chatTabMenu.ts";

interface Props {
  currentTitle: string;
  /** Saves the new title; a rejection keeps the dialog open. */
  onRename: (title: string) => Promise<void>;
  onClose: () => void;
  onError: (message: string) => void;
}

export function RenameChatDialog({ currentTitle, onRename, onClose, onError }: Props) {
  const [value, setValue] = useState(currentTitle);
  const [pending, setPending] = useState(false);
  const motionRef = useDialogMotion<HTMLDivElement>();

  async function submit() {
    if (pending) return;
    const title = renamedChatTitle(currentTitle, value);
    if (title === null) return onClose();
    setPending(true);
    try {
      await onRename(title);
      onClose();
    } catch (e) {
      setPending(false);
      onError(e instanceof Error ? e.message : String(e));
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
      <div
        className="modal rename-ws-dialog rename-chat-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-chat-title"
        aria-describedby="rename-chat-desc"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
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
