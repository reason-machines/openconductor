// Transcript UI: draws the rows from `buildRows` (see view.ts) in Conductor's
// message list layout (renderApp `UDo` turn row, `MDo` turn, `PDo` summary
// row, `TDo` turn footer; evidence/chat/README.md). Each turn is one block:
// its prompt bubble, its agent output (tool rows from ToolRows.tsx, text as
// markdown) and, once finished, its footer.

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatTranscript } from "./reducer.ts";
import { buildRows, isToolExpanded, type PartView, type ReportOrigin } from "./view.ts";
import { canCollapse, foldAgentRows, isSummaryOpen, summaryLabel, type AgentBlock, type DisplayRow, type ToolSummary } from "./toolGroups.ts";
import { Markdown } from "./markdown.ts";
import { ConductorToolRow, Lucide, ToolIcon } from "./ToolRows.tsx";
import { footerTime } from "./turnFooter.ts";
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
  /** Opens "Reset chat?" for a turn; without it turns have no More actions menu. */
  onResetChat?: (turnId: string) => void;
  /** "Reset chat" is shown but disabled, e.g. while the agent is working. */
  resetDisabled?: boolean;
  /** Extra content at the end of a finished turn's footer (the files it changed). */
  turnFooter?: (turnId: string) => ReactNode;
  /** The workspace folder, so tool rows show paths inside it relative. */
  workspacePath?: string;
  /** A file badge in a tool row was clicked. */
  onOpenFile?: (path: string) => void;
  /** Clock for the footer's time of day (tests pin it). */
  now?: () => number;
}

export function Transcript({
  transcript,
  expandToolsByDefault = false,
  dontCollapseToolCalls = false,
  onRetry,
  onResetChat,
  resetDisabled = false,
  turnFooter,
  workspacePath,
  onOpenFile,
  now = Date.now,
}: TranscriptProps) {
  const rows = useMemo(() => foldAgentRows(buildRows(transcript), transcript.activeTurn), [transcript]);
  const turns = useMemo(() => groupTurns(rows), [rows]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const toggleTool = (id: string) => setToggled((prev) => new Map(prev).set(id, !isToolExpanded(id, prev, expandToolsByDefault)));
  const [summaries, setSummaries] = useState<ReadonlyMap<string, "expanded" | "collapsed">>(new Map());
  const ctx: RowContext = {
    isOpen: (id) => isToolExpanded(id, toggled, expandToolsByDefault),
    onToggle: toggleTool,
    summaries: {
      isOpen: (id, running) => isSummaryOpen(canCollapse(running, dontCollapseToolCalls), summaries.get(id)),
      toggle: (id, open) => setSummaries((prev) => new Map(prev).set(id, open ? "collapsed" : "expanded")),
    },
    onRetry,
    onResetChat,
    resetDisabled,
    turnFooter,
    workspacePath,
    onOpenFile,
    now,
  };

  return (
    <div className="transcript">
      {turns.map((turn) => {
        const footer = turn.rows.find((r): r is TurnEndRow => r.kind === "turn_end");
        return (
          <div key={turn.key} className="oc-turn" data-turn-id={turn.turnId}>
            <div className="oc-turn-body">
              <div className="oc-turn-items">
                {turn.rows.map((row) => (row.kind === "turn_end" ? null : <Row key={row.key} row={row} ctx={ctx} />))}
              </div>
              {footer ? <TurnFooter row={footer} ctx={ctx} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type TurnEndRow = Extract<DisplayRow, { kind: "turn_end" }>;

interface Turn {
  key: string;
  turnId: string;
  rows: DisplayRow[];
}

const rowTurn = (row: DisplayRow): string => (row.kind === "agent" || row.kind === "turn_end" ? row.turnId : row.message.turnId);

/** Consecutive rows of one turn form one turn block, as Conductor lists turns. */
function groupTurns(rows: DisplayRow[]): Turn[] {
  const out: Turn[] = [];
  for (const row of rows) {
    const turnId = rowTurn(row);
    const last = out[out.length - 1];
    if (last && last.turnId === turnId && !last.rows.some((r) => r.kind === "turn_end")) last.rows.push(row);
    else out.push({ key: `turn:${row.key}`, turnId, rows: [row] });
  }
  return out;
}

interface RowContext {
  isOpen: (toolId: string) => boolean;
  onToggle: (toolId: string) => void;
  summaries: {
    isOpen: (summaryId: string, turnRunning: boolean) => boolean;
    toggle: (summaryId: string, open: boolean) => void;
  };
  onRetry?: (prompt: string, turnId: string) => void;
  onResetChat?: (turnId: string) => void;
  resetDisabled: boolean;
  turnFooter?: (turnId: string) => ReactNode;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
  now: () => number;
}

function Row({ row, ctx }: { row: Exclude<DisplayRow, TurnEndRow>; ctx: RowContext }) {
  switch (row.kind) {
    case "user":
      return (
        <div className="chat-msg chat-user oc-msg-user" data-message-role="user">
          <div className="oc-user-col">
            <div className="chat-bubble oc-bubble">
              <div className="oc-user-text">{row.text}</div>
              <MessageActions text={row.text} />
            </div>
            {row.cancelled ? <div className="chat-cancelled">Cancelled</div> : null}
          </div>
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
      return <Agent block={row} ctx={ctx} />;
  }
}

/** Conductor's turn footer: duration · end time, copy and More actions, then the turn's changed files. */
function TurnFooter({ row, ctx }: { row: TurnEndRow; ctx: RowContext }) {
  const { onRetry, onResetChat, resetDisabled, turnFooter } = ctx;
  const when = footerTime(row.startedAt, row.endedAt, ctx.now());
  return (
    <div className={`chat-turn-end oc-turn-footer status-${row.status ?? "unknown"}`} data-turn-id={row.turnId}>
      {when ? (
        <span className="oc-turn-time" title={row.startedAt && row.endedAt ? `${new Date(row.startedAt).toLocaleTimeString()} → ${new Date(row.endedAt).toLocaleTimeString()}` : undefined}>
          {when}
        </span>
      ) : null}
      {row.status === "failed" ? <span className="chat-turn-error">{row.error ?? "The turn failed."}</span> : null}
      {row.status === "cancelled" ? <span className="chat-badge">Interrupted by user</span> : null}
      <span className="chat-turn-actions">
        {row.finalText ? <CopyButton text={row.finalText} label="Copy final message" /> : null}
        {onResetChat ? <TurnMenu disabled={resetDisabled} onResetChat={row.canReset ? () => onResetChat(row.turnId) : undefined} /> : null}
        {row.retryPrompt && onRetry ? (
          <button type="button" className="chat-action oc-text-action" onClick={() => onRetry(row.retryPrompt!, row.turnId)}>
            Retry
          </button>
        ) : null}
      </span>
      {turnFooter?.(row.turnId)}
    </div>
  );
}

/**
 * Conductor's turn footer "More actions" menu (every finished turn has it):
 * Fork to new tab, Fork to new workspace, and Reset chat on turns before the
 * last. Forking is not built yet, so its items show disabled.
 */
function TurnMenu({ disabled, onResetChat }: { disabled: boolean; onResetChat?: () => void }) {
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
      <button type="button" className="oc-icon-action" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Lucide name="ellipsis" className="oc-icon-action-svg" />
      </button>
      {open ? (
        <div className="chat-menu" role="menu">
          <button type="button" role="menuitem" className="chat-menu-item" disabled title="Not available yet">
            Fork to new tab
          </button>
          <button type="button" role="menuitem" className="chat-menu-item" disabled title="Not available yet">
            Fork to new workspace
          </button>
          {onResetChat ? (
            <button
              type="button"
              role="menuitem"
              className="chat-menu-item"
              data-action="reset-chat"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                onResetChat();
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

/** A turn's agent output; its items sit directly in the turn's item list, as Conductor's do. */
function Agent({ block, ctx }: { block: AgentBlock; ctx: RowContext }) {
  return (
    <>
      {block.empty && block.streaming ? (
        <div className="chat-msg chat-assistant oc-msg-assistant">
          <span className="chat-typing" aria-label="Agent is responding" />
        </div>
      ) : null}
      {block.items.map((item) => {
        if (item.kind === "part") return <Part key={item.key} part={item.part} preview={item.preview === true} ctx={ctx} />;
        const open = ctx.summaries.isOpen(item.summary.id, block.running);
        return (
          <Fragment key={item.summary.id}>
            <SummaryRow summary={item.summary} open={open} onToggle={block.running ? undefined : () => ctx.summaries.toggle(item.summary.id, open)} />
            {open ? item.parts.map((p) => <Part key={p.key} part={p.part} ctx={ctx} />) : null}
          </Fragment>
        );
      })}
    </>
  );
}

/** Conductor's summary row (`PDo`): chevron, "4 tool calls, 2 messages", one icon per distinct tool. */
function SummaryRow({ summary, open, onToggle }: { summary: ToolSummary; open: boolean; onToggle?: () => void }) {
  const label = summaryLabel(summary);
  const icons = [...new Map(summary.toolNames.map((n) => [n, n])).values()];
  return (
    <button type="button" className="chat-tool-summary-row oc-summary" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${label}`} disabled={!onToggle} onClick={onToggle}>
      <Lucide name={open ? "chevron-down" : "chevron-right"} className="oc-summary-chevron" />
      <span className="oc-summary-main">
        <span className="oc-summary-label">{label}</span>
        {icons.length > 0 ? (
          <span className="oc-summary-icons" aria-hidden>
            {icons.map((name) => (
              <ToolIcon key={name} name={name} className="oc-tool-icon" />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** `preview`: the turn's final text; Conductor mutes every other text (`ROo` `muted: !isPreviewMessage`). */
function Part({ part, preview = false, ctx }: { part: PartView; preview?: boolean; ctx: RowContext }) {
  switch (part.kind) {
    case "text":
      return (
        <div className="chat-msg chat-assistant oc-msg-assistant" data-message-role="assistant">
          <div className="oc-assistant-col">
            <div className="oc-text-wrap">
              <Markdown
                text={part.text}
                className={`oc-prose chat-text${preview ? "" : " muted"}${part.streaming ? " is-streaming" : ""}`}
                onOpenLink={(href) => void openUrl(href)}
                workspacePath={ctx.workspacePath}
                onOpenFile={ctx.onOpenFile}
              />
            </div>
          </div>
        </div>
      );
    case "thinking":
      return <ThinkingRow id={`thinking:${part.text.slice(0, 32)}`} text={part.text} streaming={part.streaming} ctx={ctx} />;
    case "tool": {
      const { call } = part;
      return (
        // data-tool-input: the block's input as the agent reported it (paths marked local or cloud), for e2e checks.
        <div className={`chat-tool oc-tool-wrap status-${call.status}`} data-tool-input={JSON.stringify(call.input ?? null)}>
          <ConductorToolRow
            tool={call.tool}
            status={call.status}
            result={call.result}
            isError={call.status === "error"}
            open={ctx.isOpen(call.id)}
            onToggle={() => ctx.onToggle(call.id)}
            workspacePath={ctx.workspacePath}
            onOpenFile={ctx.onOpenFile}
          />
        </div>
      );
    }
  }
}

/** `ppo`: a thinking block as a row, its text as a muted chip; open while it streams. */
function ThinkingRow({ id, text, streaming, ctx }: { id: string; text: string; streaming: boolean; ctx: RowContext }) {
  const open = streaming || ctx.isOpen(id);
  return (
    <div className="chat-thinking oc-tool-wrap">
      <div className="oc-tool">
        <div className="oc-tool-head opens" role="button" aria-expanded={open} onClick={() => ctx.onToggle(id)}>
          <div className="oc-tool-icon-slot">
            <div className="oc-tool-icon-swap">
              <div className="oc-tool-icon-idle">
                <Lucide name="brain" className="oc-tool-icon" />
              </div>
              <Lucide name={open ? "minus" : "plus"} className="oc-tool-icon-hover" />
            </div>
          </div>
          <div className="oc-tool-main align-center">
            <div className="oc-tool-left">
              <span>Thinking</span>
            </div>
            {!open ? (
              <div className="oc-tool-right">
                <span className="oc-code-chip sans">{text.trim()}</span>
              </div>
            ) : null}
          </div>
        </div>
        {open ? (
          <div className="oc-tool-content plain">
            <Markdown text={text} className={`oc-prose muted${streaming ? " is-streaming" : ""}`} />
          </div>
        ) : null}
      </div>
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
  const title = state === "copied" ? "Copied!" : state === "failed" ? "Couldn't copy" : label;
  return (
    <button type="button" className="oc-icon-action" onClick={copy} title={title} aria-label={label}>
      <Lucide name={state === "copied" ? "check" : "copy"} className="oc-icon-action-svg" />
    </button>
  );
}
