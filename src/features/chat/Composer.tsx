// Chat composer: the message box, Send / Stop, and the follow-up queue above
// it. Keys come from the keybinding registry, so the send-key preset (Enter
// or ⌘Enter) and user overrides apply: `chat.submitMessage` sends with the
// default follow-up mode, `chat.submitOppositeFollowUp` with the other one,
// `chat.newLine` inserts a line break and `chat.cancel` stops the agent.

import { useState, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { SendIcon } from "../../components/Icons";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../keybindings/shortcut.ts";
import { canSteerNow, headStatusLabel, resolveSendMode, type ChatQueue, type FollowUpMode, type SendMode } from "./queue.ts";
import type { QueueAction } from "./reasonChat.ts";
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
}

export function Composer({ draft, setDraft, inputRef, placeholder, queue, canSteer, followUpMode = "steering", onSubmit, onStop, onQueue, attachments }: ComposerProps) {
  const { overrides } = useKeybindingOverrides();
  const keys = (id: string) => effectiveShortcuts(id, overrides);
  const hint = (id: string) => {
    const s = keys(id)[0];
    return s ? glyphs(s) : "";
  };
  const working = queue.status === "working" || queue.status === "cancelling";
  const hasText = draft.trim() !== "";
  const mode = (opposite: boolean) => resolveSendMode({ canSteer: canSteerNow(queue, canSteer), defaultMode: followUpMode, opposite });
  const sendMode = working ? mode(false) : "queue";

  function submit(opposite: boolean) {
    const text = draft.trim();
    if (!text) return;
    onSubmit(text, working ? mode(opposite) : "queue");
    setDraft("");
  }

  useKeybindings({ "chat.cancel": () => (working ? onStop() : false) });

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const ev = e.nativeEvent;
    const hit = (id: string) => keys(id).some((s) => matchesEvent(s, ev));
    if (ev.isComposing) return;
    if (hit("chat.cancel") && working) {
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
      {queue.items.length > 0 ? <QueuePanel queue={queue} canSteer={canSteerNow(queue, canSteer)} onQueue={onQueue} /> : null}
      <form
        className="composer"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          submit(false);
        }}
      >
        {attachments}
        <textarea ref={inputRef} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} rows={3} />
        <div className="composer-bar">
          <span className="muted">
            {hint("chat.submitMessage")} to {working ? (sendMode === "steer" ? "steer" : "queue") : "send"}
            {working && canSteerNow(queue, canSteer) ? `, ${hint("chat.submitOppositeFollowUp")} to ${sendMode === "steer" ? "queue" : "steer"}` : ""}
            {`, ${hint("chat.newLine")} for a new line`}
          </span>
          <span className="composer-actions">
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

function QueuePanel({ queue, canSteer, onQueue }: { queue: ChatQueue; canSteer: boolean; onQueue: (a: QueueAction) => void }) {
  const [collapsed, setCollapsed] = useState(false);
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
        <ol className="queue-list" aria-label="Queued messages">
          {queue.items.map((m, i) => (
            <QueueRow key={m.id} id={m.id} text={m.text} first={i === 0} last={i === queue.items.length - 1} editing={queue.editingId === m.id} canSteer={canSteer} onQueue={onQueue} />
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
}

function QueueRow({ id, text, first, last, editing, canSteer, onQueue }: RowProps) {
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
            if (e.key === "Escape") onQueue({ kind: "cancelEdit" });
            else if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onQueue({ kind: "saveEdit", text: value, steer: e.metaKey && canSteer });
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
    <li className="queue-row">
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
