// Chat composer, after Conductor's (renderApp `ITo`, DOM and classes in
// evidence/chat/composer/README.md): a rounded box with the message, the model
// picker at its bottom left and, at its bottom right, the "+" menu, Stop while
// the agent works and the send button (↑ to send, ↵ to queue behind a running
// turn). A "⌘L to focus" pill shows while the box is empty and unfocused, and
// typing "/" at the start opens the slash-command menu on top of the box.
// Keys come from the keybinding registry, so the send-key preset (Enter
// or ⌘Enter) and user overrides apply: `chat.submitMessage` sends with the
// default follow-up mode, `chat.submitOppositeFollowUp` with the other one,
// `chat.newLine` inserts a line break, `chat.cancel` stops the agent and
// `chat.focus` focuses the box. With `onAttachFiles`, files come in through
// the "+" menu, `chat.addAttachment` (⌘U), pasting files and dropping them.

import { useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../keybindings/shortcut.ts";
import { canSteerNow, headStatusLabel, resolveSendMode, turnRunning, type ChatQueue, type FollowUpMode, type SendMode } from "./queue.ts";
import type { QueueAction } from "./queue.ts";
import { dropOrder, queueRowKey, type QueueCommand, type QueueFocus } from "./queueKeys.ts";
import { completeCommand, matchCommands, slashQuery, type SlashCommand } from "./slashCommands.ts";
import { SlashMenu } from "./SlashMenu.tsx";
import { ArrowUpIcon, CornerDownLeftIcon, PaperclipIcon, PlusIcon, StopCircleIcon } from "./composerIcons.tsx";
import "./queue.css";
import "./composer.css";

/** Conductor's placeholders (`S5`): idle, and while the agent works. */
export const COMPOSER_PLACEHOLDER = "Ask to make changes, @mention files, run /commands";
export const COMPOSER_PLACEHOLDER_WORKING = "Add a follow up";

export interface ComposerProps {
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  /** Defaults to Conductor's: "Ask to make changes, …", "Add a follow up" while working. */
  placeholder?: string;
  queue: ChatQueue;
  canSteer: boolean;
  followUpMode?: FollowUpMode;
  onSubmit: (text: string, mode: SendMode) => void;
  onStop: () => void;
  onQueue: (action: QueueAction) => void;
  /** Files going out with the next message, shown above the message box. */
  attachments?: ReactNode;
  /** Takes files the user attaches; without it the "+" menu has no Add attachment. */
  onAttachFiles?: (files: File[]) => void;
  /** The model picker (or another agent's picker), at the box's bottom left. */
  picker?: ReactNode;
  /** More pickers after it (an agent's access mode), in the same row. */
  controls?: ReactNode;
  /** Commands the "/" menu offers for this chat's agent. */
  slashCommands?: readonly SlashCommand[];
  /**
   * A sent message that starts with "/": return true when it was handled as
   * a command (the draft is cleared and nothing goes to the agent).
   */
  onCommand?: (text: string) => boolean;
}

export function Composer({
  draft,
  setDraft,
  inputRef,
  placeholder,
  queue,
  canSteer,
  followUpMode = "steering",
  onSubmit,
  onStop,
  onQueue,
  attachments,
  onAttachFiles,
  picker,
  controls,
  slashCommands = [],
  onCommand,
}: ComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
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
  // Conductor's send button: ↑ "Send message", or ↵ "Queue message" while a turn runs and the message would wait.
  const queues = working && sendMode === "queue";

  // The message grows with its text, as Conductor's editor does; the box scrolls past 188 px.
  useLayoutEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${box.scrollHeight}px`;
  }, [draft, inputRef]);

  const query = focused ? slashQuery(draft, caret) : null;
  const slashMatches = useMemo(() => (query === null || query === slashDismissed ? [] : matchCommands(slashCommands, query)), [query, slashDismissed, slashCommands]);
  const slashOpen = slashMatches.length > 0;
  const slashFocus = Math.min(slashIndex, Math.max(0, slashMatches.length - 1));

  function pickCommand(name: string) {
    const next = completeCommand(draft, name);
    setDraft(next);
    setSlashIndex(0);
    requestAnimationFrame(() => {
      const box = inputRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(next.length, next.length);
      setCaret(next.length);
    });
  }

  function submit(opposite: boolean) {
    const text = draft.trim();
    if (!text) return;
    if (text.startsWith("/") && onCommand?.(text)) {
      setDraft("");
      return;
    }
    onSubmit(text, working ? mode(opposite) : "queue");
    setDraft("");
  }

  useKeybindings({
    "chat.cancel": () => (working ? onStop() : false),
    "chat.addAttachment": () => (onAttachFiles ? fileInput.current?.click() : false),
    "chat.focus": () => {
      const box = inputRef.current;
      if (!box || box.offsetParent === null) return false;
      box.focus();
    },
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
    const plain = !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey;
    if (slashOpen && plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const n = slashMatches.length;
      setSlashIndex((slashFocus + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
      return;
    }
    if (slashOpen && plain && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pickCommand(slashMatches[slashFocus]!.command.name);
      return;
    }
    if (slashOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSlashDismissed(query);
      return;
    }
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

  const showFocusPill = !focused && !hasText && attachments == null && hint("chat.focus") !== "";
  const sendLabel = `${queues ? "Queue message" : "Send message"} ${hint("chat.submitMessage")}`;

  return (
    <div className="composer-wrap">
      {queue.items.length > 0 ? <QueuePanel queue={queue} canSteer={canSteerNow(queue, canSteer)} onQueue={onQueue} listRef={queueRef} focus={focus} keys={keys} /> : null}
      <div className="oc-composer-anchor">
        {slashOpen ? <SlashMenu matches={slashMatches} focused={slashFocus} hasQuery={query !== ""} onPick={pickCommand} onFocus={setSlashIndex} /> : null}
        <form
          className={`composer oc-composer${dragging ? " is-dropping" : ""}`}
          aria-label="composer"
          onMouseDown={(e) => {
            // Conductor's box is all click target: a click on its padding focuses the message.
            if (e.target === e.currentTarget) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
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
          <div className="oc-composer-input">
            <textarea
              ref={inputRef}
              value={draft}
              placeholder={placeholder ?? (working ? COMPOSER_PLACEHOLDER_WORKING : COMPOSER_PLACEHOLDER)}
              onChange={(e) => {
                setDraft(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setSlashIndex(0);
                setSlashDismissed(null);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              rows={3}
              spellCheck={false}
            />
          </div>
          {showFocusPill ? (
            <div className="oc-focus-pill" aria-hidden>
              {hint("chat.focus")} to focus
            </div>
          ) : null}
          <div className="oc-composer-left">
            {picker}
            {controls}
          </div>
          <div className="oc-composer-right">
            <AddMenu hint={hint("chat.addAttachment")} onAddAttachment={onAttachFiles ? () => fileInput.current?.click() : undefined} />
            {onAttachFiles ? (
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
            ) : null}
            {working ? (
              <button
                className="oc-icon-btn composer-stop"
                type="button"
                title="Stop the agent"
                aria-label={`Stop the agent (${hint("chat.cancel")})`}
                data-state={queue.status}
                disabled={queue.status === "cancelling"}
                onClick={onStop}
              >
                <StopCircleIcon size={16} />
              </button>
            ) : null}
            {!working || hasText ? (
              <button className="oc-send" type="submit" disabled={!hasText} data-mode={sendMode} aria-label={sendLabel} title={sendLabel} data-testid="composer-send-button">
                {queues ? <CornerDownLeftIcon size={16} strokeWidth={1.5} /> : <ArrowUpIcon size={16} strokeWidth={1.5} />}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

/** Conductor's "+" button (`a7i`): "Add attachments and more"; this build offers Add attachment. */
function AddMenu({ hint, onAddAttachment }: { hint: string; onAddAttachment?: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  if (!onAddAttachment) return null;
  return (
    <span
      className="oc-add-menu"
      ref={ref}
      onBlur={(e) => {
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button type="button" className="oc-icon-btn oc-add-btn" aria-label="Add" title="Add attachments and more" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <PlusIcon size={16} strokeWidth={1.5} />
      </button>
      {open ? (
        <div className="oc-menu oc-add-popup" role="menu">
          <button
            type="button"
            role="menuitem"
            className="oc-menu-item"
            onClick={() => {
              setOpen(false);
              onAddAttachment();
            }}
          >
            <PaperclipIcon size={16} />
            <span className="oc-menu-item-label">Add attachment</span>
            <span className="oc-kbd-hint">{hint}</span>
          </button>
        </div>
      ) : null}
    </span>
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
