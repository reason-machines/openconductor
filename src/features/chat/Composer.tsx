// Chat composer: the message box, Send / Stop, and the follow-up queue above
// it. Keys come from the keybinding registry, so the send-key preset (Enter
// or ⌘Enter) and user overrides apply: `chat.submitMessage` sends with the
// default follow-up mode, `chat.submitOppositeFollowUp` with the other one,
// `chat.newLine` inserts a line break and `chat.cancel` stops the agent.
// With `onAttachFiles`, files come in through the attach button,
// `chat.addAttachment` (⌘U), pasting files and dropping them on the composer.

import { useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { PaperclipIcon, SendIcon } from "../../components/Icons";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../keybindings/shortcut.ts";
import { canSteerNow, headStatusLabel, resolveSendMode, turnRunning, type ChatQueue, type FollowUpMode, type SendMode } from "./queue.ts";
import type { QueueAction } from "./queue.ts";
import { dropOrder, queueRowKey, type QueueCommand, type QueueFocus } from "./queueKeys.ts";
import "./queue.css";

export interface ComposerProps {
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  placeholder: string;
  queue: ChatQueue;
  canSteer: boolean;
  followUpMode?: FollowUpMode;
  onSubmit: (text: string, mode: SendMode) => void;
  onStop: () => void;
  onQueue: (action: QueueAction) => void;
  /** Files going out with the next message, shown above the message box. */
  attachments?: ReactNode;
  /** Pickers shown before the key hint (the chat's agent and its access). */
  controls?: ReactNode;
  /** Takes files the user attaches; without it the composer has no attach button. */
  onAttachFiles?: (files: File[]) => void;
}

export function Composer({ draft, setDraft, inputRef, placeholder, queue, canSteer, followUpMode = "steering", onSubmit, onStop, onQueue, attachments, controls, onAttachFiles }: ComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { overrides } = useKeybindingOverrides();
  const keys = (id: string) => effectiveShortcuts(id, overrides);
  const hint = (id: string) => {
    const s = keys(id)[0];
    return s ? glyphs(s) : "";
  };
  const working = turnRunning(queue.status);
  const hasText = draft.trim() !== "";
  const mode = (opposite: boolean) => resolveSendMode({ canSteer: canSteerNow(queue, canSteer), defaultMode: followUpMode, opposite });
  const sendMode = working ? mode(false) : "queue";

  function submit(opposite: boolean) {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text, working ? mode(opposite) : "queue");
    setDraft("");
  }

  useKeybindings({
    "chat.cancel": () => (working ? onStop() : false),
    "chat.addAttachment": () => (onAttachFiles ? fileInput.current?.click() : false),
  });

  const takeFiles = (list: FileList | null | undefined): boolean => {
    const files = list ? Array.from(list) : [];
    if (!onAttachFiles || files.length === 0) return false;
    onAttachFiles(files);
    return true;
  };
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (takeFiles(e.clipboardData?.files)) e.preventDefault();
  };
  const hasFiles = (e: DragEvent) => onAttachFiles !== undefined && Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const queueRef = useRef<HTMLOListElement>(null);

  /** Moves focus to a queued row or back to the message box. */
  function focus(target: QueueFocus) {
    if (target === "composer") return inputRef.current?.focus();
    queueRef.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(target.row)}"]`)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const ev = e.nativeEvent;
    const hit = (id: string) => keys(id).some((s) => matchesEvent(s, ev));
    if (ev.isComposing) return;
    // ↑ with the caret at the very start goes to the last queued message.
    const box = e.currentTarget;
    if (e.key === "ArrowUp" && !e.shiftKey && !e.metaKey && !e.altKey && box.selectionStart === 0 && box.selectionEnd === 0 && queue.items.length > 0 && queue.editingId === null) {
      e.preventDefault();
      focus({ row: queue.items[queue.items.length - 1].id });
    } else if (hit("chat.cancel") && working) {
      e.preventDefault();
      onStop();
    } else if (hit("chat.submitOppositeFollowUp")) {
      e.preventDefault();
      submit(true);
    } else if (hit("chat.submitMessage")) {
      e.preventDefault();
      submit(false);
    }
    // `chat.newLine` (Shift+Enter, or Enter under the ⌘Enter preset) falls through to the textarea.
  }

  return (
    <div className="composer-wrap">
      {queue.items.length > 0 ? <QueuePanel queue={queue} canSteer={canSteerNow(queue, canSteer)} onQueue={onQueue} listRef={queueRef} focus={focus} keys={keys} /> : null}
      <form
        className={`composer${dragging ? " is-dropping" : ""}`}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submit(false);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          if (takeFiles(e.dataTransfer?.files)) e.preventDefault();
        }}
      >
        {attachments}
        <textarea ref={inputRef} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste} rows={3} />
        <div className="composer-bar">
          <span className="composer-hint">
            {controls}
            <span className="muted">
              {hint("chat.submitMessage")} to {working ? (sendMode === "steer" ? "steer" : "queue") : "send"}
              {working && canSteerNow(queue, canSteer) ? `, ${hint("chat.submitOppositeFollowUp")} to ${sendMode === "steer" ? "queue" : "steer"}` : ""}
              {`, ${hint("chat.newLine")} for a new line`}
            </span>
          </span>
          <span className="composer-actions">
            {onAttachFiles ? (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  aria-hidden
                  tabIndex={-1}
                  onChange={(e) => {
                    takeFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button type="button" className="btn btn-small composer-attach" title={`Add attachment (${hint("chat.addAttachment")})`} aria-label="Add attachment" onClick={() => fileInput.current?.click()}>
                  <PaperclipIcon size={14} />
                </button>
              </>
            ) : null}
            {working ? (
              <button
                className="btn btn-small composer-stop"
                type="button"
                title="Stop the agent"
                aria-label={`Stop the agent (${hint("chat.cancel")})`}
                data-state={queue.status}
                onClick={onStop}
              >
                {queue.status === "cancelling" ? "Stopping…" : "Stop"} <kbd>{hint("chat.cancel")}</kbd>
              </button>
            ) : null}
            {!working || hasText ? (
              <button className="btn btn-primary btn-small" type="submit" disabled={!hasText} data-mode={sendMode}>
                <SendIcon size={14} /> {working ? (sendMode === "steer" ? "Steer" : "Queue") : "Send"}
              </button>
            ) : null}
          </span>
        </div>
      </form>
    </div>
  );
}

type Keys = (id: string) => ReturnType<typeof effectiveShortcuts>;

interface QueuePanelProps {
  queue: ChatQueue;
  canSteer: boolean;
  onQueue: (a: QueueAction) => void;
  listRef: RefObject<HTMLOListElement>;
  focus: (target: QueueFocus) => void;
  keys: Keys;
}

function QueuePanel({ queue, canSteer, onQueue, listRef, focus, keys }: QueuePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const ids = queue.items.map((m) => m.id);

  // The focused row's keys (the row itself, not its buttons): edit, delete, steer and moving between rows.
  function onRowKeyDown(e: KeyboardEvent<HTMLLIElement>, id: string) {
    if (e.target !== e.currentTarget || e.nativeEvent.isComposing) return;
    const ev = e.nativeEvent;
    const hit = (command: QueueCommand) => keys(command).some((s) => matchesEvent(s, ev));
    const r = queueRowKey(ids, id, e.key, hit, canSteer);
    if (!r) return;
    e.preventDefault();
    e.stopPropagation();
    switch (r.kind) {
      case "edit":
        return onQueue({ kind: "edit", id });
      case "delete":
        onQueue({ kind: "delete", id });
        return requestAnimationFrame(() => focus(r.focus));
      case "steer":
        onQueue({ kind: "steer", id });
        return requestAnimationFrame(() => focus(r.focus));
      case "focus":
        return focus(r.focus);
    }
  }

  const drag = (id: string) => ({
    draggable: queue.editingId === null,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", id);
      setDragged(id);
    },
    onDragOver: (e: React.DragEvent) => {
      if (dragged !== null) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragged !== null && dragged !== id) onQueue({ kind: "reorder", ids: dropOrder(ids, dragged, id) });
      setDragged(null);
    },
    onDragEnd: () => setDragged(null),
  });
  const label = headStatusLabel(queue);
  return (
    <div className={`queue${queue.paused ? " is-paused" : ""}`}>
      <div className="queue-head">
        <span className="queue-status">
          {label} · {queue.items.length} {queue.items.length === 1 ? "message" : "messages"}
        </span>
        <span className="queue-head-actions">
          {queue.paused ? (
            <button type="button" className="chat-action" onClick={() => onQueue({ kind: "resume" })}>
              Resume
            </button>
          ) : (
            <button type="button" className="chat-action" onClick={() => onQueue({ kind: "pause" })}>
              Pause
            </button>
          )}
          <button type="button" className="chat-action" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
            {collapsed ? "Expand queue" : "Collapse queue"}
          </button>
        </span>
      </div>
      {collapsed ? null : (
        <ol className="queue-list" aria-label="Queued messages" ref={listRef} data-keybinding-local="true">
          {queue.items.map((m, i) => (
            <QueueRow
              key={m.id}
              id={m.id}
              text={m.text}
              first={i === 0}
              last={i === queue.items.length - 1}
              editing={queue.editingId === m.id}
              canSteer={canSteer}
              onQueue={onQueue}
              keys={keys}
              dragging={dragged === m.id}
              rowProps={{ ...drag(m.id), onKeyDown: (e: KeyboardEvent<HTMLLIElement>) => onRowKeyDown(e, m.id) }}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

interface RowProps {
  id: string;
  text: string;
  first: boolean;
  last: boolean;
  editing: boolean;
  canSteer: boolean;
  onQueue: (a: QueueAction) => void;
  keys: Keys;
  dragging: boolean;
  /** Keys and drag handlers for the row. */
  rowProps: React.LiHTMLAttributes<HTMLLIElement>;
}

function QueueRow({ id, text, first, last, editing, canSteer, onQueue, keys, dragging, rowProps }: RowProps) {
  const [value, setValue] = useState(text);
  if (editing) {
    return (
      <li className="queue-row is-editing">
        <textarea
          className="queue-edit"
          aria-label="Edit queued message"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            const ev = e.nativeEvent;
            if (ev.isComposing) return;
            const hit = (command: string) => keys(command).some((s) => matchesEvent(s, ev));
            if (hit("chat.queueEdit.cancel")) {
              e.preventDefault();
              onQueue({ kind: "cancelEdit" });
            } else if (canSteer && hit("chat.queueEdit.saveAndSteer")) {
              e.preventDefault();
              onQueue({ kind: "saveEdit", text: value, steer: true });
            } else if (hit("chat.queueEdit.save")) {
              e.preventDefault();
              onQueue({ kind: "saveEdit", text: value, steer: false });
            }
          }}
          rows={2}
        />
        <span className="queue-row-actions">
          <button type="button" className="chat-action" onClick={() => onQueue({ kind: "cancelEdit" })}>
            Cancel
          </button>
          {canSteer ? (
            <button type="button" className="chat-action" onClick={() => onQueue({ kind: "saveEdit", text: value, steer: true })}>
              Save and steer
            </button>
          ) : null}
          <button type="button" className="chat-action" onClick={() => onQueue({ kind: "saveEdit", text: value, steer: false })}>
            Save
          </button>
        </span>
      </li>
    );
  }
  return (
    <li className={`queue-row${dragging ? " is-dragging" : ""}`} data-id={id} tabIndex={0} aria-label={`Queued message: ${text}`} {...rowProps}>
      <span className="queue-text" title={text}>
        {text}
      </span>
      <span className="queue-row-actions">
        <button type="button" className="chat-action" aria-label="Move up" disabled={first} onClick={() => onQueue({ kind: "move", id, by: -1 })}>
          ↑
        </button>
        <button type="button" className="chat-action" aria-label="Move down" disabled={last} onClick={() => onQueue({ kind: "move", id, by: 1 })}>
          ↓
        </button>
        <button
          type="button"
          className="chat-action"
          onClick={() => {
            setValue(text);
            onQueue({ kind: "edit", id });
          }}
        >
          Edit
        </button>
        {canSteer ? (
          <button type="button" className="chat-action" title="Steer with queued message" onClick={() => onQueue({ kind: "steer", id })}>
            Steer
          </button>
        ) : null}
        <button type="button" className="chat-action" aria-label="Delete queued message" onClick={() => onQueue({ kind: "delete", id })}>
          Delete
        </button>
      </span>
    </li>
  );
}
