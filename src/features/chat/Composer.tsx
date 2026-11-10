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
// With `minimize`, an empty box shrinks to one row while a content tab is shown
// (composerMinimize.ts); focus, a click or ⌘L expands it.

import { ShortcutHint, Tooltip } from "../../components/ui/Tooltip.tsx";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { usePresence } from "../../components/motion/usePresence.ts";
import { useKeybindingOverrides, useKeybindings } from "../../keybindings/KeybindingsProvider.tsx";
import { effectiveShortcuts } from "../../keybindings/overrides.ts";
import { glyphs, matchesEvent } from "../../keybindings/shortcut.ts";
import { canSteerNow, headStatusLabel, resolveSendMode, turnRunning, type ChatQueue, type FollowUpMode, type SendMode } from "./queue.ts";
import type { QueueAction } from "./queue.ts";
import { dropOrder, queueRowKey, type QueueCommand, type QueueFocus } from "./queueKeys.ts";
import { completeInsert, matchCommands, slashQuery, type SlashCommand } from "./slashCommands.ts";
import { SlashMenu } from "./SlashMenu.tsx";
import { fuzzyFilterFiles } from "../../backend";
import type { FileMatch } from "../../spotlight/quickOpen";
import { fileMentionQuery, mentionItems, type MentionItem } from "./fileMentions.ts";
import { ComposerEditor, type ComposerEditorHandle, type ComposerSelection } from "./ComposerEditor.tsx";
import { composerPrompt } from "./composerDocument.ts";
import { queuedUserDraft, submittedUserPrompt, type SentUserContentV1, type UserPrompt } from "./userContent.ts";
import { FileMentionMenu } from "./FileMentionMenu.tsx";
import { ArrowUpIcon, CornerDownLeftIcon, PaperclipIcon, PlusIcon, StopCircleIcon } from "./composerIcons.tsx";
import type { ComposerMinimize } from "./useComposerMinimize.ts";
import "./queue.css";
import "./composer.css";

/** Conductor's placeholders (`S5`): idle, and while the agent works. */
export const COMPOSER_PLACEHOLDER = "Ask to make changes, @mention files, run /commands";
export const COMPOSER_PLACEHOLDER_WORKING = "Add a follow up";

export interface ComposerProps {
  draft: string;
  setDraft: (text: string) => void;
  inputRef: RefObject<ComposerEditorHandle>;
  /** Defaults to Conductor's: "Ask to make changes, …", "Add a follow up" while working. */
  placeholder?: string;
  queue: ChatQueue;
  canSteer: boolean;
  followUpMode?: FollowUpMode;
  onSubmit: (input: UserPrompt, mode: SendMode) => void;
  /** False when the owner clears only after asynchronous delivery succeeds. */
  clearOnSubmit?: boolean;
  onStop: () => void;
  onQueue: (action: QueueAction) => void;
  /** Files going out with the next message, shown above the message box. */
  attachments?: ReactNode;
  hasAttachments?: boolean;
  workspacePath?: string;
  /** Takes files the user attaches; without it the "+" menu has no Add attachment. */
  onAttachFiles?: (files: File[]) => void;
  onLinkWorkspaces?: () => void;
  onAttachTerminalOutput?: () => void;
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
  /** The one-line state (Conductor's minimized composer over a file diff or the PR). */
  minimize?: ComposerMinimize;
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
  clearOnSubmit = true,
  onStop,
  onQueue,
  attachments,
  hasAttachments = false,
  workspacePath,
  onAttachFiles,
  onLinkWorkspaces,
  onAttachTerminalOutput,
  picker,
  controls,
  slashCommands = [],
  onCommand,
  minimize,
}: ComposerProps) {
  const minimized = minimize?.minimized ?? false;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState<ComposerSelection>({ text: "", start: 0, end: 0 });
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDismissed, setMentionDismissed] = useState<string | null>(null);
  const [files, setFiles] = useState<{ workspacePath: string; query: string; matches: FileMatch[] } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
  const { overrides } = useKeybindingOverrides();
  const keys = (id: string) => effectiveShortcuts(id, overrides);
  const hint = (id: string) => {
    const s = keys(id)[0];
    return s ? glyphs(s) : "";
  };
  const working = turnRunning(queue.status);
  const hasText = composerPrompt(draft).trim() !== "";
  const canSubmit = hasText || hasAttachments;
  const mode = (opposite: boolean) => resolveSendMode({ canSteer: canSteerNow(queue, canSteer), defaultMode: followUpMode, opposite });
  const sendMode = working ? mode(false) : "queue";
  // Conductor's send button: ↑ "Send message", or ↵ "Queue message" while a turn runs and the message would wait.
  const queues = working && sendMode === "queue";

  // Conductor blurs the editor when the box minimizes.
  useLayoutEffect(() => {
    if (minimized && inputRef.current?.focused()) inputRef.current.blur();
  }, [minimized, inputRef]);

  const query = focused ? slashQuery(selection.text, selection.start) : null;
  const slashMatches = useMemo(() => (query === null || query === slashDismissed ? [] : matchCommands(slashCommands, query)), [query, slashDismissed, slashCommands]);
  const slashOpen = slashMatches.length > 0;
  const slashFocus = Math.min(slashIndex, Math.max(0, slashMatches.length - 1));
  const mention = focused && workspacePath ? fileMentionQuery(selection.text, selection.start, selection.end) : null;
  const mentionKey = mention ? `${mention.start}:${mention.query}` : null;
  const mentionQuery = mentionKey !== mentionDismissed ? mention?.query : undefined;
  useEffect(() => {
    setFiles(null);
    setMentionIndex(0);
    if (!workspacePath || mentionQuery === undefined) return;
    let live = true;
    void fuzzyFilterFiles(workspacePath, mentionQuery, false).then(
      (matches) => { if (live) setFiles({ workspacePath, query: mentionQuery, matches }); },
      () => { if (live) setFiles(null); },
    );
    return () => { live = false; };
  }, [workspacePath, mentionQuery]);
  const fileMatches = files && files.workspacePath === workspacePath && files.query === mentionQuery ? files.matches : [];
  const mentionMatches = mentionItems(mentionQuery ?? "", fileMatches, !!onAttachTerminalOutput, !!onLinkWorkspaces);
  const mentionOpen = mention !== null && mentionQuery !== undefined && mentionMatches.length > 0;
  const mentionFocus = Math.min(mentionIndex, Math.max(0, mentionMatches.length - 1));

  function pickMention(item: MentionItem) {
    const box = inputRef.current;
    if (!box || box.composing()) return;
    const current = box.selection();
    const range = fileMentionQuery(current.text, current.start, current.end);
    if (!range || `${range.start}:${range.query}` !== mentionKey) return;
    if (item.kind === "add-directory") {
      if (!onLinkWorkspaces || !box.deleteRange(range)) return;
      setMentionDismissed(mentionKey);
      onLinkWorkspaces();
      return;
    }
    if (item.kind === "terminal") {
      if (!onAttachTerminalOutput || !box.deleteRange(range)) return;
      setMentionDismissed(mentionKey);
      onAttachTerminalOutput();
      return;
    }
    const file = item.match;
    box.insertFile(range, { path: file.relative_path, label: file.relative_path, directory: file.file.is_directory });
    setMentionDismissed(mentionKey);
  }

  function pickCommand(command: SlashCommand) {
    if (inputRef.current?.composing()) return;
    const next = completeInsert(selection.text, command.insert ?? `/${command.name}`);
    inputRef.current?.replaceText(next);
    setSlashIndex(0);
  }

  function submit(opposite: boolean) {
    if (inputRef.current?.composing()) return;
    const input = submittedUserPrompt(draft);
    if (!input.text && !hasAttachments) return;
    if (input.text.startsWith("/") && onCommand?.(input.text)) {
      setDraft("");
      return;
    }
    onSubmit(input, working ? mode(opposite) : "queue");
    if (clearOnSubmit) setDraft("");
  }

  useKeybindings({
    "chat.cancel": () => (working ? onStop() : false),
    "chat.addAttachment": () => (onAttachFiles ? fileInput.current?.click() : false),
    "chat.focus": () => {
      const box = inputRef.current;
      if (!box || !box.visible()) return false;
      box.focus();
    },
  });

  const takeFiles = (list: FileList | null | undefined): boolean => {
    const files = list ? Array.from(list) : [];
    if (!onAttachFiles || files.length === 0) return false;
    onAttachFiles(files);
    return true;
  };
  const hasFiles = (e: DragEvent) => onAttachFiles !== undefined && Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const queueRef = useRef<HTMLOListElement>(null);

  /** Moves focus to a queued row or back to the message box. */
  function focus(target: QueueFocus) {
    if (target === "composer") return inputRef.current?.focus();
    queueRef.current?.querySelector<HTMLElement>(`li[data-id="${CSS.escape(target.row)}"]`)?.focus();
  }

  function onKeyDown(e: globalThis.KeyboardEvent) {
    const ev = e;
    const hit = (id: string) => keys(id).some((s) => matchesEvent(s, ev));
    if (ev.isComposing) return;
    const plain = !e.shiftKey && !e.metaKey && !e.altKey && !e.ctrlKey;
    if (mentionOpen && plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setMentionIndex((mentionFocus + (e.key === "ArrowDown" ? 1 : mentionMatches.length - 1)) % mentionMatches.length);
      return;
    }
    if (mentionOpen && plain && (e.key === "Enter" || e.key === "Tab")) {
      const selected = mentionMatches[mentionFocus];
      if (selected) {
        e.preventDefault();
        pickMention(selected);
      }
      return;
    }
    if (mentionOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setMentionDismissed(mentionKey);
      return;
    }
    if (slashOpen && plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      const n = slashMatches.length;
      setSlashIndex((slashFocus + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
      return;
    }
    if (slashOpen && plain && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pickCommand(slashMatches[slashFocus]!.command);
      return;
    }
    if (slashOpen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSlashDismissed(query);
      return;
    }
    // ↑ with the caret at the very start goes to the last queued message.
    const current = inputRef.current?.selection();
    if (e.key === "ArrowUp" && !e.shiftKey && !e.metaKey && !e.altKey && current?.start === 0 && current.end === 0 && queue.items.length > 0 && queue.editingId === null) {
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
    else if (hit("chat.newLine")) {
      e.preventDefault();
      inputRef.current?.newline();
    }
  }

  // Conductor's `Lm` (composerMinimize.ts focusHintVisible); the open model picker hides it in CSS.
  const showFocusPill = !focused && !hasText && attachments == null && hint("chat.focus") !== "";
  const focusPill = (inline: boolean) => (
    <div className={`oc-focus-pill${inline ? " is-inline" : ""}`} aria-hidden>
      {hint("chat.focus")} to focus
    </div>
  );
  const sendLabel = `${queues ? "Queue message" : "Send message"} ${hint("chat.submitMessage")}`;

  return (
    <div className="composer-wrap">
      {queue.items.length > 0 ? <QueuePanel queue={queue} canSteer={canSteerNow(queue, canSteer)} onQueue={onQueue} listRef={queueRef} focus={focus} keys={keys} /> : null}
      <div className="oc-composer-anchor">
        {mentionOpen ? <FileMentionMenu matches={mentionMatches} focused={mentionFocus} hasQuery={mentionQuery !== ""} onPick={pickMention} onFocus={setMentionIndex} /> : null}
        {slashOpen ? <SlashMenu matches={slashMatches} focused={slashFocus} hasQuery={query !== ""} onPick={pickCommand} onFocus={setSlashIndex} /> : null}
        <form
          className={`composer oc-composer${dragging ? " is-dropping" : ""}`}
          aria-label="composer"
          data-composer-minimized={minimized || undefined}
          data-composer-resize-instant={(minimize && !minimize.animate) || undefined}
          onClick={() => minimize?.expand()}
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
            <ComposerEditor
              inputRef={inputRef}
              value={draft}
              placeholder={placeholder ?? (working ? COMPOSER_PLACEHOLDER_WORKING : COMPOSER_PLACEHOLDER)}
              onChange={(value) => {
                setDraft(value);
                setMentionDismissed(null);
                setSlashIndex(0);
                setSlashDismissed(null);
              }}
              onSelection={setSelection}
              onFocus={() => {
                setFocused(true);
                minimize?.expand();
              }}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              onPasteFiles={takeFiles}
            />
          </div>
          {showFocusPill && !minimized ? focusPill(false) : null}
          {/* Conductor stops clicks on its controls from reaching the box, so the model picker opens without expanding it. */}
          <div className="oc-composer-left" onClick={(e) => e.stopPropagation()}>
            {picker}
            {controls ? <span className="oc-composer-fade">{controls}</span> : null}
          </div>
          <div className="oc-composer-right" onClick={(e) => e.stopPropagation()}>
            <span className="oc-composer-fade">
              <AddMenu hint={hint("chat.addAttachment")} onAddAttachment={onAttachFiles ? () => fileInput.current?.click() : undefined} onLinkWorkspaces={onLinkWorkspaces} />
            </span>
            {showFocusPill && minimized ? focusPill(true) : null}
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
              <Tooltip content={<span className="oc-tip-inline">Cancel <ShortcutHint commandId="chat.cancel" /></span>}>
                <button
                  className="oc-icon-btn composer-stop"
                  type="button"
                  aria-label={`Stop the agent (${hint("chat.cancel")})`}
                  data-state={queue.status}
                  disabled={queue.status === "cancelling"}
                  onClick={onStop}
                >
                  <StopCircleIcon size={16} />
                </button>
              </Tooltip>
            ) : null}
            {!working || canSubmit ? (
              <Tooltip content={<span className="oc-tip-inline">{queues ? "Queue message" : "Send message"}<ShortcutHint commandId="chat.submitMessage" /></span>}>
                <button className="oc-send" type="submit" disabled={!canSubmit} data-mode={sendMode} aria-label={sendLabel} data-testid="composer-send-button">
                  {queues ? <CornerDownLeftIcon size={16} strokeWidth={1.5} /> : <ArrowUpIcon size={16} strokeWidth={1.5} />}
                </button>
              </Tooltip>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

function AddMenu({ hint, onAddAttachment, onLinkWorkspaces }: { hint: string; onAddAttachment?: () => void; onLinkWorkspaces?: () => void }) {
  const [open, setOpen] = useState(false);
  const popup = usePresence(open);
  const ref = useRef<HTMLSpanElement>(null);
  if (!onAddAttachment && !onLinkWorkspaces) return null;
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
      <Tooltip content={<p>Add attachments and more</p>}>
        <button type="button" className="oc-icon-btn oc-add-btn" aria-label="Add" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <PlusIcon size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      {popup.mounted ? (
        <div className="oc-menu oc-add-popup" role="menu" data-motion="popup" {...popup.attrs}>
          {onAddAttachment ? <button
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
          </button> : null}
          {onLinkWorkspaces ? <button type="button" role="menuitem" className="oc-menu-item" onClick={() => { setOpen(false); onLinkWorkspaces(); }}>
            <PlusIcon size={16} /><span className="oc-menu-item-label">Link workspaces</span>
          </button> : null}
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
              userContent={m.userContent}
              attachmentNames={m.attachments.map((a) => a.name)}
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
  userContent?: SentUserContentV1;
  attachmentNames: readonly string[];
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

function QueueRow({ id, text, userContent, attachmentNames, first, last, editing, canSteer, onQueue, keys, dragging, rowProps }: RowProps) {
  const [value, setValue] = useState(() => queuedUserDraft({ text, userContent }));
  const editor = useRef<ComposerEditorHandle>(null);
  useLayoutEffect(() => {
    if (!editing) return;
    setValue(queuedUserDraft({ text, userContent }));
    editor.current?.focus();
  }, [editing, text, userContent]);
  if (editing) {
    return (
      <li className="queue-row is-editing">
        <div className="queue-edit" role="group" aria-label="Edit queued message">
          <ComposerEditor
            value={value}
            inputRef={editor}
            placeholder="Edit queued message"
            onChange={setValue}
            onSelection={() => {}}
            onFocus={() => {}}
            onBlur={() => {}}
            onPasteFiles={() => false}
            onKeyDown={(ev) => {
              if (ev.isComposing) return;
              const hit = (command: string) => keys(command).some((s) => matchesEvent(s, ev));
              if (hit("chat.queueEdit.cancel")) {
                ev.preventDefault();
                onQueue({ kind: "cancelEdit" });
              } else if (canSteer && hit("chat.queueEdit.saveAndSteer")) {
                ev.preventDefault();
                onQueue({ kind: "saveEdit", input: submittedUserPrompt(value), steer: true });
              } else if (hit("chat.queueEdit.save")) {
                ev.preventDefault();
                onQueue({ kind: "saveEdit", input: submittedUserPrompt(value), steer: false });
              }
            }}
          />
        </div>
        <span className="queue-row-actions">
          <button type="button" className="chat-action" onClick={() => onQueue({ kind: "cancelEdit" })}>
            Cancel
          </button>
          {canSteer ? (
            <button type="button" className="chat-action" onClick={() => onQueue({ kind: "saveEdit", input: submittedUserPrompt(value), steer: true })}>
              Save and steer
            </button>
          ) : null}
          <button type="button" className="chat-action" onClick={() => onQueue({ kind: "saveEdit", input: submittedUserPrompt(value), steer: false })}>
            Save
          </button>
        </span>
      </li>
    );
  }
  const label = text.trim() || attachmentNames.join(", ");
  return (
    <li className={`queue-row${dragging ? " is-dragging" : ""}`} data-id={id} tabIndex={0} aria-label={`Queued message: ${label}`} {...rowProps}>
      <span className="queue-text" title={label}>
        {label}
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
            setValue(queuedUserDraft({ text, userContent }));
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
