// Transcript UI: draws the rows from `buildRows` (see view.ts). Assistant text
// renders as markdown (markdown.ts); user text stays as typed.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatTranscript } from "./reducer.ts";
import { buildRows, isToolExpanded, type PartView, type ReportOrigin, type ToolCallView } from "./view.ts";
import { canCollapse, foldAgentRows, isSummaryOpen, summaryLabel, type AgentBlock, type DisplayRow, type ToolSummary } from "./toolGroups.ts";
import { Markdown } from "./markdown.ts";
import { turnTime } from "./turnTime.ts";
import { openUrl } from "../../backend.ts";
import "./chat.css";

export interface TranscriptProps {
  transcript: ChatTranscript;
  /** "Keep tool calls expanded" setting. */
  expandToolsByDefault?: boolean;
  /** "Don't collapse tool calls" setting: summary rows stay open. */
  dontCollapseToolCalls?: boolean;
  /** Sends a failed or cancelled turn's prompt again. */
  onRetry?: (prompt: string, turnId: string) => void;
  /** Opens "Reset chat?" for a turn that can be reset. */
  onResetChat?: (turnId: string) => void;
  /** "Fork to new tab" in every finished turn's More actions menu. */
  onForkToNewTab?: (turnId: string) => void;
  /** "Fork to new workspace" in the same menu, for a workspace on this machine. */
  onForkToNewWorkspace?: (turnId: string) => void;
  /** The fork items are shown but disabled, e.g. while a fork is being made. */
  forkDisabled?: boolean;
  /** The footer hover's first line, "Opus 5.5 via Reason" (Conductor's `kDo`). */
  turnAgent?: string;
  /** "Reset chat" is shown but disabled, e.g. while the agent is working. */
  resetDisabled?: boolean;
  /** Extra content under a finished turn (the files it changed). */
  turnFooter?: (turnId: string) => ReactNode;
}

export function Transcript({
  transcript,
  expandToolsByDefault = false,
  dontCollapseToolCalls = false,
  onRetry,
  onResetChat,
  resetDisabled = false,
  turnFooter,
  onForkToNewTab,
  onForkToNewWorkspace,
  forkDisabled = false,
  turnAgent,
}: TranscriptProps) {
  const rows = useMemo(() => foldAgentRows(buildRows(transcript), transcript.activeTurn), [transcript]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const toggleTool = (id: string) =>
    setToggled((prev) => new Map(prev).set(id, !isToolExpanded(id, prev, expandToolsByDefault)));
  const [summaries, setSummaries] = useState<ReadonlyMap<string, "expanded" | "collapsed">>(new Map());
  const summaryState: SummaryState = {
    isOpen: (id, running) => isSummaryOpen(canCollapse(running, dontCollapseToolCalls), summaries.get(id)),
    toggle: (id, open) => setSummaries((prev) => new Map(prev).set(id, open ? "collapsed" : "expanded")),
  };

  return (
    <div className="transcript">
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          isOpen={(id) => isToolExpanded(id, toggled, expandToolsByDefault)}
          onToggle={toggleTool}
          summaries={summaryState}
          onRetry={onRetry}
          onResetChat={onResetChat}
          resetDisabled={resetDisabled}
          turnFooter={turnFooter}
          onForkToNewTab={onForkToNewTab}
          onForkToNewWorkspace={onForkToNewWorkspace}
          forkDisabled={forkDisabled}
          turnAgent={turnAgent}
        />
      ))}
    </div>
  );
}

interface SummaryState {
  isOpen: (summaryId: string, turnRunning: boolean) => boolean;
  toggle: (summaryId: string, open: boolean) => void;
}

interface RowProps {
  row: DisplayRow;
  isOpen: (toolId: string) => boolean;
  onToggle: (toolId: string) => void;
  summaries: SummaryState;
  onRetry?: (prompt: string, turnId: string) => void;
  onResetChat?: (turnId: string) => void;
  resetDisabled: boolean;
  turnFooter?: (turnId: string) => ReactNode;
  onForkToNewTab?: (turnId: string) => void;
  onForkToNewWorkspace?: (turnId: string) => void;
  forkDisabled: boolean;
  turnAgent?: string;
}

function Row({ row, isOpen, onToggle, summaries, onRetry, onResetChat, resetDisabled, turnFooter, onForkToNewTab, onForkToNewWorkspace, forkDisabled, turnAgent }: RowProps) {
  switch (row.kind) {
    case "user":
      return (
        <div className="chat-msg chat-user">
          <div className="chat-bubble">{row.text}</div>
          {row.cancelled ? <div className="chat-cancelled">Cancelled</div> : null}
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
    case "agent":
      return <Agent block={row} isOpen={isOpen} onToggle={onToggle} summaries={summaries} />;
    case "turn_end": {
      const time = turnTime(row.startedAt, row.endedAt);
      const fork = onForkToNewTab ? () => onForkToNewTab(row.turnId) : undefined;
      const forkWorkspace = onForkToNewWorkspace ? () => onForkToNewWorkspace(row.turnId) : undefined;
      const reset = row.canReset && onResetChat ? () => onResetChat(row.turnId) : undefined;
      return (
        <div className={`chat-turn-end status-${row.status ?? "unknown"}`} data-turn-id={row.turnId}>
          {row.status === "failed" ? <span className="chat-turn-error">{row.error ?? "The turn failed."}</span> : null}
          {row.status === "cancelled" ? <span className="chat-badge">Interrupted by user</span> : null}
          {time ? (
            <span className="chat-turn-time" title={turnAgent ? `${turnAgent}\n${time.range}` : time.range}>
              {time.label}
            </span>
          ) : null}
          <span className="chat-turn-actions">
            {row.finalText ? <CopyButton text={row.finalText} label="Copy final message" /> : null}
            {row.retryPrompt && onRetry ? (
              <button type="button" className="chat-action" onClick={() => onRetry(row.retryPrompt!, row.turnId)}>
                Retry
              </button>
            ) : null}
            {fork || forkWorkspace || reset ? (
              <TurnMenu onFork={fork} onForkWorkspace={forkWorkspace} forkDisabled={forkDisabled} onReset={reset} resetDisabled={resetDisabled} />
            ) : null}
          </span>
          {turnFooter?.(row.turnId)}
        </div>
      );
    }
  }
}

/**
 * Conductor's turn footer "More actions" menu: "Fork to new tab" and "Fork to
 * new workspace" on every turn, "Reset chat" on turns that can be reset.
 */
function TurnMenu({
  onFork,
  onForkWorkspace,
  forkDisabled,
  onReset,
  resetDisabled,
}: {
  onFork?: () => void;
  onForkWorkspace?: () => void;
  forkDisabled: boolean;
  onReset?: () => void;
  resetDisabled: boolean;
}) {
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
          {onFork ? (
            <button
              type="button"
              role="menuitem"
              className="chat-menu-item"
              disabled={forkDisabled}
              onClick={() => {
                setOpen(false);
                onFork();
              }}
            >
              <ForkIcon /> Fork to new tab
            </button>
          ) : null}
          {onForkWorkspace ? (
            <button
              type="button"
              role="menuitem"
              className="chat-menu-item"
              disabled={forkDisabled}
              onClick={() => {
                setOpen(false);
                onForkWorkspace();
              }}
            >
              <WorkspaceForkIcon /> Fork to new workspace
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              role="menuitem"
              className="chat-menu-item"
              disabled={resetDisabled}
              onClick={() => {
                setOpen(false);
                onReset();
              }}
            >
              <ResetIcon /> Reset chat
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function ForkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="12" cy="3" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
      <path d="M4 4.5v1.5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4.5M8 8v3.5" />
    </svg>
  );
}

function WorkspaceForkIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.75 4.25a1 1 0 0 1 1-1h3l1.5 1.5h5.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1z" />
      <path d="M8 7.25v3.5M6.25 9h3.5" />
    </svg>
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

function Agent({ block, isOpen, onToggle, summaries }: { block: AgentBlock; isOpen: (id: string) => boolean; onToggle: (id: string) => void; summaries: SummaryState }) {
  return (
    <div className={`chat-msg chat-assistant${block.streaming ? " is-streaming" : ""}`}>
      {block.empty && block.streaming ? <span className="chat-typing" aria-label="Agent is responding" /> : null}
      {block.items.map((item) => {
        if (item.kind === "part") return <Part key={item.key} part={item.part} isOpen={isOpen} onToggle={onToggle} />;
        const open = summaries.isOpen(item.summary.id, block.running);
        return (
          <div key={item.summary.id} className="chat-tool-group" data-open={open}>
            <SummaryRow summary={item.summary} open={open} onToggle={block.running ? undefined : () => summaries.toggle(item.summary.id, open)} />
            {open ? item.parts.map((p) => <Part key={p.key} part={p.part} isOpen={isOpen} onToggle={onToggle} />) : null}
          </div>
        );
      })}
      {block.copyText ? <MessageActions text={block.copyText} /> : null}
    </div>
  );
}

/** Conductor's summary row: chevron, "4 tool calls, 2 messages", one icon per distinct tool. */
function SummaryRow({ summary, open, onToggle }: { summary: ToolSummary; open: boolean; onToggle?: () => void }) {
  const label = summaryLabel(summary);
  return (
    <button type="button" className="chat-tool-summary-row" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${label}`} disabled={!onToggle} onClick={onToggle}>
      <Chevron open={open} />
      <span>{label}</span>
      <span className="chat-tool-summary-icons" aria-hidden>
        {summary.toolNames.map((name) => (
          <ToolIcon key={name} name={name} />
        ))}
      </span>
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className="chat-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={open ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"} />
    </svg>
  );
}

type ToolIconKind = "search" | "read" | "edit" | "terminal" | "web" | "task" | "tool";

/** The icon Conductor shows for a tool, by the tool's name. */
export function toolIconKind(name: string): ToolIconKind {
  const n = name.toLowerCase();
  if (/grep|glob|search|find|ls/.test(n)) return n.includes("web") ? "web" : "search";
  if (/web|fetch|url/.test(n)) return "web";
  if (/edit|write|patch|notebook/.test(n)) return "edit";
  if (/read|view|cat/.test(n)) return "read";
  if (/bash|shell|terminal|exec|command|run/.test(n)) return "terminal";
  if (/task|agent|todo/.test(n)) return "task";
  return "tool";
}

const ICON_PATHS: Record<ToolIconKind, string[]> = {
  search: ["M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11z", "M11 11l3.5 3.5"],
  read: ["M4 1.5h5.5L13 5v9.5H4z", "M9.5 1.5V5H13", "M6 8h5M6 10.5h5"],
  edit: ["M4 1.5h5.5L13 5v9.5H4z", "M9.5 1.5V5H13", "M6.5 11.5l3.5-3.5 1 1-3.5 3.5h-1z"],
  terminal: ["M2.5 4.5l3.5 3.5-3.5 3.5", "M8 12.5h5.5"],
  web: ["M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z", "M1.5 8h13", "M8 1.5c2 2 2 11 0 13M8 1.5c-2 2-2 11 0 13"],
  task: ["M3 4h10M3 8h10M3 12h6"],
  tool: ["M10.5 2a3 3 0 0 0-2.8 4.1L2.5 11.3l2.2 2.2 5.2-5.2A3 3 0 0 0 14 5.5l-1.8 1.8-1.5-1.5L12.5 4A3 3 0 0 0 10.5 2z"],
};

function ToolIcon({ name }: { name: string }) {
  return (
    <svg className="chat-tool-icon" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICON_PATHS[toolIconKind(name)].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
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
        <span className="chat-tool-status" aria-label={call.status}>
          <ToolIcon name={call.name} />
        </span>
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
