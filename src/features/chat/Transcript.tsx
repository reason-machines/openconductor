// Transcript UI: draws the rows from `buildRows` (see view.ts). Assistant text
// renders as markdown (markdown.ts); user text stays as typed.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatTranscript } from "./reducer.ts";
import { buildRows, isToolExpanded, type PartView, type ReportOrigin, type RowView, type ToolCallView } from "./view.ts";
import { plainText } from "./types.ts";
import { Markdown } from "./markdown.ts";
import { openUrl } from "../../backend.ts";
import "./chat.css";

export interface TranscriptProps {
  transcript: ChatTranscript;
  /** "Keep tool calls expanded" setting. */
  expandToolsByDefault?: boolean;
  /** Sends a failed or cancelled turn's prompt again. */
  onRetry?: (prompt: string, turnId: string) => void;
  /** Opens "Reset chat?" for a turn; without it turns have no More actions menu. */
  onResetChat?: (turnId: string) => void;
  /** "Reset chat" is shown but disabled, e.g. while the agent is working. */
  resetDisabled?: boolean;
  /** Extra content under a finished turn (the files it changed). */
  turnFooter?: (turnId: string) => ReactNode;
}

export function Transcript({ transcript, expandToolsByDefault = false, onRetry, onResetChat, resetDisabled = false, turnFooter }: TranscriptProps) {
  const rows = useMemo(() => buildRows(transcript), [transcript]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const toggleTool = (id: string) =>
    setToggled((prev) => new Map(prev).set(id, !isToolExpanded(id, prev, expandToolsByDefault)));

  return (
    <div className="transcript">
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          isOpen={(id) => isToolExpanded(id, toggled, expandToolsByDefault)}
          onToggle={toggleTool}
          onRetry={onRetry}
          onResetChat={onResetChat}
          resetDisabled={resetDisabled}
          turnFooter={turnFooter}
        />
      ))}
    </div>
  );
}

interface RowProps {
  row: RowView;
  isOpen: (toolId: string) => boolean;
  onToggle: (toolId: string) => void;
  onRetry?: (prompt: string, turnId: string) => void;
  onResetChat?: (turnId: string) => void;
  resetDisabled: boolean;
  turnFooter?: (turnId: string) => ReactNode;
}

function Row({ row, isOpen, onToggle, onRetry, onResetChat, resetDisabled, turnFooter }: RowProps) {
  switch (row.kind) {
    case "user":
      return (
        <div className="chat-msg chat-user">
          <div className="chat-bubble">{row.text}</div>
          <MessageActions text={row.text} />
        </div>
      );
    case "report":
      return (
        <div className="chat-msg chat-report" data-origin={row.origin.kind}>
          <div className="chat-report-label">{reportLabel(row.origin)}</div>
          <div className="chat-report-body">{row.text}</div>
        </div>
      );
    case "system":
      return <div className="chat-msg chat-system">{row.text}</div>;
    case "assistant":
      return (
        <div className={`chat-msg chat-assistant${row.streaming ? " is-streaming" : ""}`}>
          {row.parts.length === 0 && row.streaming ? <span className="chat-typing" aria-label="Agent is responding" /> : null}
          {row.parts.map((part, i) => (
            <Part key={part.kind === "tool" ? part.call.id : i} part={part} isOpen={isOpen} onToggle={onToggle} />
          ))}
          {!row.streaming && plainText(row.message) ? <MessageActions text={plainText(row.message)} /> : null}
        </div>
      );
    case "turn_end":
      return (
        <div className="chat-turn-footer">
          {turnFooter?.(row.turnId)}
          <div className={`chat-turn-end status-${row.status ?? "unknown"}`} data-turn-id={row.turnId}>
            {row.status === "failed" ? <span className="chat-turn-error">{row.error ?? "The turn failed."}</span> : null}
            {row.status === "cancelled" ? <span className="muted">Stopped.</span> : null}
            <span className="chat-turn-actions">
              {row.finalText ? <CopyButton text={row.finalText} label="Copy final message" /> : null}
              {row.retryPrompt && onRetry ? (
                <button type="button" className="chat-action" onClick={() => onRetry(row.retryPrompt!, row.turnId)}>
                  Retry
                </button>
              ) : null}
              {row.canReset && onResetChat ? <TurnMenu disabled={resetDisabled} onResetChat={() => onResetChat(row.turnId)} /> : null}
            </span>
          </div>
        </div>
      );
  }
}

/** Conductor's turn footer "More actions" menu; here it holds "Reset chat". */
function TurnMenu({ disabled, onResetChat }: { disabled: boolean; onResetChat: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current?.contains(e.target as Node) || setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <span className="chat-turn-menu" ref={ref} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button type="button" className="chat-action" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open ? (
        <div className="chat-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="chat-menu-item"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onResetChat();
            }}
          >
            <ResetIcon /> Reset chat
          </button>
        </div>
      ) : null}
    </span>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.5 2.5v3h3" />
    </svg>
  );
}

function reportLabel(origin: ReportOrigin): string {
  return origin.kind === "session" ? `Report from session ${origin.sessionId}` : `Sent with API key ${origin.name}`;
}

function Part({ part, isOpen, onToggle }: { part: PartView; isOpen: (id: string) => boolean; onToggle: (id: string) => void }) {
  switch (part.kind) {
    case "text":
      return <Markdown text={part.text} className={`chat-text${part.streaming ? " is-streaming" : ""}`} onOpenLink={(href) => void openUrl(href)} />;
    case "thinking":
      return (
        <details className="chat-thinking" open={part.streaming}>
          <summary>Thinking</summary>
          <div className={part.streaming ? "is-streaming" : undefined}>{part.text}</div>
        </details>
      );
    case "tool":
      return <ToolRow call={part.call} open={isOpen(part.call.id)} onToggle={() => onToggle(part.call.id)} />;
  }
}

/** One-line summary of a tool's input: the first string field, e.g. a path or command. */
function toolSummary(input: unknown): string {
  if (input && typeof input === "object") {
    for (const v of Object.values(input as Record<string, unknown>)) if (typeof v === "string" && v) return v.split("\n")[0]!;
  }
  return "";
}

function ToolRow({ call, open, onToggle }: { call: ToolCallView; open: boolean; onToggle: () => void }) {
  const summary = toolSummary(call.input);
  return (
    <div className={`chat-tool status-${call.status}`}>
      <button type="button" className="chat-tool-head" aria-expanded={open} onClick={onToggle}>
        <span className="chat-tool-dot" aria-label={call.status} />
        <span className="chat-tool-name">{call.name}</span>
        {summary ? <span className="chat-tool-summary">{summary}</span> : null}
      </button>
      {open ? (
        <div className="chat-tool-body">
          <pre>{JSON.stringify(call.input, null, 2)}</pre>
          {call.result !== undefined ? <pre className="chat-tool-result">{call.result}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageActions({ text }: { text: string }) {
  return (
    <div className="chat-msg-actions">
      <CopyButton text={text} label="Copy message" />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1500);
  }
  return (
    <button type="button" className="chat-action" onClick={copy} title={label}>
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : label}
    </button>
  );
}
