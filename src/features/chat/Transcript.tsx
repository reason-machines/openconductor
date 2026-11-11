// Transcript UI: draws the rows from `buildRows` (see view.ts) in Conductor's
// message list layout (renderApp `UDo` turn row, `MDo` turn, `PDo` summary
// row, `TDo` turn footer; evidence/chat/README.md). Each turn is one block:
// its prompt bubble, its agent output (tool rows from ToolRows.tsx, text as
// markdown) and, once finished, its footer.

import { Tooltip } from "../../components/ui/Tooltip.tsx";
import { ChatSignInCard } from "./ChatSignInCard.tsx";
import { Fragment, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { DropdownMenu, MenuItem } from "../../components/menu/ContextMenu";
import { EllipsisIcon, MessageSquarePlusIcon, SplitIcon, Undo2Icon } from "../../components/menu/menuIcons";
import { turnMenuItems, TURN_MENU_TOOLTIP, TURN_MENU_TRIGGER_LABEL, type TurnMenuItem } from "./turnMenu.ts";
import { LinkMenuNotify, LinkWithMenu } from "./LinkMenu.tsx";
import type { ChatTranscript } from "./reducer.ts";
import { buildRows, isToolExpanded, type PartView, type ReportOrigin } from "./view.ts";
import { canCollapse, foldAgentRows, isSummaryOpen, summaryLabel, type AgentBlock, type DisplayRow, type ToolSummary } from "./toolGroups.ts";
import { Markdown, type MarkdownOptions } from "./markdown.ts";
import { ConductorToolRow, Lucide, opensByDefault, ToolIcon } from "./ToolRows.tsx";
import { turnDayClock, turnTime } from "./turnTime.ts";
import { TurnDetails } from "./TurnDetails.tsx";
import { turnAgentLabel } from "./fork.ts";
import { openUrl } from "../../backend.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import { isSignInFailure } from "./agentSignIn.ts";
import { thinkingChipText } from "./thinkingChip.ts";
import { SentUserContent } from "./SentUserContent.tsx";
import { UserText } from "./UserText.tsx";
import type { UserPrompt } from "./userContent.ts";
import { userMessageCopyText } from "./userMessageCopy.ts";
import { useBoolPref } from "../../settings/useBoolPref.ts";
import { assistantDisplayText } from "./assistantText.ts";
import { TranscriptSearch } from "./TranscriptSearch.tsx";
import "./chat.css";

export interface TranscriptProps {
  transcript: ChatTranscript;
  searchEnabled?: boolean;
  /** "Keep tool calls expanded" setting. */
  expandToolsByDefault?: boolean;
  /** "Don't collapse tool calls" setting: summary rows stay open. */
  dontCollapseToolCalls?: boolean;
  /** Sends a failed or cancelled turn's prompt again. */
  onRetry?: (prompt: UserPrompt, turnId: string) => void;
  /** Opens "Reset chat?" for a turn that can be reset. */
  onResetChat?: (turnId: string) => void;
  /** "Fork to new tab" in every finished turn's More actions menu. */
  onForkToNewTab?: (turnId: string) => void;
  /** "Fork to new workspace" in the same menu, for a workspace on this machine. */
  onForkToNewWorkspace?: (turnId: string) => void;
  /** The fork items are shown but disabled, e.g. while a fork is being made. */
  forkDisabled?: boolean;
  /** Agent name only; the footer combines it with the turn's historical message model. */
  turnAgent?: string;
  /** The chat's agent: a turn that failed because it is not signed in links to its Settings › Agents tab. */
  chatAgent?: ChatAgentId;
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
  /** Toasts, e.g. a markdown link's "Copy link address" (LinkMenu.tsx). */
  notify?: MarkdownOptions["notify"];
}

export function Transcript({
  transcript,
  searchEnabled = false,
  expandToolsByDefault = false,
  dontCollapseToolCalls = false,
  onRetry,
  onResetChat,
  resetDisabled = false,
  turnFooter,
  workspacePath,
  onOpenFile,
  now = Date.now,
  onForkToNewTab,
  onForkToNewWorkspace,
  forkDisabled = false,
  turnAgent,
  chatAgent,
  notify,
}: TranscriptProps) {
  const stripAbsolutelyRight = useBoolPref("not_absolutely_right");
  const clock = useMemo(() => turnDayClock(now), [now]);
  const day = useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
  const rows = useMemo(() => foldAgentRows(buildRows(transcript), transcript.activeTurn), [transcript]);
  const turns = useMemo(() => groupTurns(rows), [rows]);
  const [toggled, setToggled] = useState<ReadonlyMap<string, boolean>>(new Map());
  const toggleTool = (id: string, defaultOpen = false) => setToggled((prev) => new Map(prev).set(id, !isToolExpanded(id, prev, expandToolsByDefault || defaultOpen)));
  const [summaries, setSummaries] = useState<ReadonlyMap<string, "expanded" | "collapsed">>(new Map());
  const ctx: RowContext = {
    stripAbsolutelyRight,
    isOpen: (id, defaultOpen = false) => isToolExpanded(id, toggled, expandToolsByDefault || defaultOpen),
    onToggle: toggleTool,
    summaries: {
      canCollapse: (running) => canCollapse(running, dontCollapseToolCalls),
      isOpen: (id, running) => isSummaryOpen(canCollapse(running, dontCollapseToolCalls), summaries.get(id)),
      toggle: (id, open) => setSummaries((prev) => new Map(prev).set(id, open ? "collapsed" : "expanded")),
    },
    onRetry,
    onResetChat,
    resetDisabled,
    turnFooter,
    workspacePath,
    onOpenFile,
    now: () => day,
    onForkToNewTab,
    onForkToNewWorkspace,
    forkDisabled,
    turnAgent,
    chatAgent,
    notify,
  };

  const content = (
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
  return <LinkMenuNotify.Provider value={notify}>
    {searchEnabled ? <TranscriptSearch transcript={transcript}>{content}</TranscriptSearch> : content}
  </LinkMenuNotify.Provider>;
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
  stripAbsolutelyRight: boolean;
  /** `defaultOpen`: Conductor's `defaultCollapsed: false` rows (a proposed plan). */
  isOpen: (toolId: string, defaultOpen?: boolean) => boolean;
  onToggle: (toolId: string, defaultOpen?: boolean) => void;
  summaries: {
    canCollapse: (turnRunning: boolean) => boolean;
    isOpen: (summaryId: string, turnRunning: boolean) => boolean;
    toggle: (summaryId: string, open: boolean) => void;
  };
  onRetry?: (prompt: UserPrompt, turnId: string) => void;
  onResetChat?: (turnId: string) => void;
  resetDisabled: boolean;
  turnFooter?: (turnId: string) => ReactNode;
  workspacePath?: string;
  onOpenFile?: (path: string) => void;
  now: () => number;
  notify?: TranscriptProps["notify"];
  onForkToNewTab?: (turnId: string) => void;
  onForkToNewWorkspace?: (turnId: string) => void;
  forkDisabled: boolean;
  turnAgent?: string;
  chatAgent?: ChatAgentId;
}

function Row({ row, ctx }: { row: Exclude<DisplayRow, TurnEndRow>; ctx: RowContext }) {
  switch (row.kind) {
    case "user":
      return (
        <div className="chat-msg chat-user oc-msg-user" data-message-role="user">
          <div className="oc-user-col">
            <div className="chat-bubble oc-bubble">
              <div className="oc-user-text" data-searchable="true">{row.message.userContent ? <SentUserContent content={row.message.userContent} workspacePath={ctx.workspacePath} onOpenFile={ctx.onOpenFile} /> : <UserText text={row.text} />}</div>
              <MessageActions text={userMessageCopyText(row.message)} />
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

/** Conductor's turn footer: duration · end time, "Copy final message" and "Show message actions", then the turn's changed files. */
function TurnFooter({ row, ctx }: { row: TurnEndRow; ctx: RowContext }) {
  const { onRetry, onResetChat, resetDisabled, turnFooter, onForkToNewTab, onForkToNewWorkspace, forkDisabled, turnAgent } = ctx;
  const fork = onForkToNewTab ? () => onForkToNewTab(row.turnId) : undefined;
  const forkWorkspace = onForkToNewWorkspace ? () => onForkToNewWorkspace(row.turnId) : undefined;
  const reset = row.canReset && onResetChat ? () => onResetChat(row.turnId) : undefined;
  const actions: Partial<Record<TurnMenuItem["id"], () => void>> = { "fork-tab": fork, "fork-workspace": forkWorkspace, "reset-chat": reset };
  const menuItems = turnMenuItems({ canForkToTab: !!fork, canForkToWorkspace: !!forkWorkspace, canReset: !!reset, forkPending: forkDisabled, resetBlocked: resetDisabled });
  const when = turnTime(row.startedAt, row.endedAt, ctx.now(), "en-US");
  return (
    <div className={`chat-turn-end oc-turn-footer status-${row.status ?? "unknown"}`} data-turn-id={row.turnId}>
      {when ? <TurnDetails when={when} agent={turnAgent ? turnAgentLabel(row.model, turnAgent) : undefined} usage={row.usage} /> : null}
      {row.status === "failed" ? <span className="chat-turn-error">{row.error ?? "The turn failed."}</span> : null}
      {row.status === "cancelled" ? <span className="chat-badge">Interrupted by user</span> : null}
      <span className="chat-turn-actions">
        {row.finalText ? <CopyButton text={row.finalText} label="Copy final message" /> : null}
        {row.retryPrompt && onRetry ? (
          <button type="button" className="chat-action oc-text-action" onClick={() => onRetry(row.retryPrompt!, row.turnId)}>
            Retry
          </button>
        ) : null}
        {menuItems.length > 0 ? <TurnMenu items={menuItems} onSelect={(id) => actions[id]?.()} /> : null}
      </span>
      {turnFooter?.(row.turnId)}
      {row.status === "failed" && ctx.chatAgent && isSignInFailure(ctx.chatAgent, row.error) ? <ChatSignInCard agent={ctx.chatAgent} onSignedIn={row.retryPrompt && onRetry ? () => onRetry(row.retryPrompt!, row.turnId) : undefined} /> : null}
    </div>
  );
}

const TURN_MENU_ICONS: Record<TurnMenuItem["icon"], (p: { className?: string }) => JSX.Element> = {
  "message-square-plus": MessageSquarePlusIcon,
  split: SplitIcon,
  "undo-2": Undo2Icon,
};

/**
 * Conductor's turn footer "Show message actions" menu (turnMenu.ts): a 20px ellipsis
 * button with the tooltip "More actions" that opens a dropdown under it.
 */
function TurnMenu({ items, onSelect }: { items: TurnMenuItem[]; onSelect: (id: TurnMenuItem["id"]) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = anchor !== null;
  return (
    <>
      <Tooltip content={TURN_MENU_TOOLTIP}>
        <button
          type="button"
          className="oc-icon-action oc-turn-menu-trigger"
          aria-label={TURN_MENU_TRIGGER_LABEL}
          aria-haspopup="menu"
          aria-expanded={open}
          data-popup-open={open || undefined}
          onClick={(e) => setAnchor(open ? null : e.currentTarget.getBoundingClientRect())}
        >
          <EllipsisIcon className="oc-icon-action-svg" />
        </button>
      </Tooltip>
      {anchor ? (
        <DropdownMenu anchor={anchor} label={TURN_MENU_TRIGGER_LABEL} className="cm-turn-menu" onClose={() => setAnchor(null)}>
          {items.map((item) => {
            const Icon = TURN_MENU_ICONS[item.icon];
            return (
              <MenuItem key={item.id} icon={<Icon />} disabled={item.disabled} onSelect={() => onSelect(item.id)}>
                {item.label}
              </MenuItem>
            );
          })}
        </DropdownMenu>
      ) : null}
    </>
  );
}

function reportLabel(origin: ReportOrigin): string {
  return origin.kind === "session" ? `Report from session ${origin.sessionId}` : `Sent with API key ${origin.name}`;
}

/** A turn's agent output; its items sit directly in the turn's item list, as Conductor's do. */
function Agent({ block, ctx }: { block: AgentBlock; ctx: RowContext }) {
  const collapsible = ctx.summaries.canCollapse(block.running);
  return (
    <>
      {block.empty && block.streaming ? (
        <div className="chat-msg chat-assistant oc-msg-assistant">
          <span className="chat-typing" aria-label="Agent is responding" />
        </div>
      ) : null}
      {block.items.map((item) => {
        if (item.kind === "part") return <Part key={item.key} partKey={item.key} part={item.part} preview={item.preview === true} ctx={ctx} />;
        const open = ctx.summaries.isOpen(item.summary.id, block.running);
        return (
          <Fragment key={item.summary.id}>
            {collapsible ? <SummaryRow summary={item.summary} open={open} onToggle={() => ctx.summaries.toggle(item.summary.id, open)} /> : null}
            {open ? item.parts.map((p) => <Part key={p.key} partKey={p.key} part={p.part} group={item.summary.id} ctx={ctx} />) : null}
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
function Part({ partKey, part, preview = false, group, ctx }: { partKey: string; part: PartView; preview?: boolean; group?: string; ctx: RowContext }) {
  switch (part.kind) {
    case "text": {
      const text = assistantDisplayText(part.text, ctx.stripAbsolutelyRight);
      if (!text.trim()) return null;
      return (
        <div className="chat-msg chat-assistant oc-msg-assistant" data-message-role="assistant" data-tool-group={group}>
          <div className="oc-assistant-col">
            <div className="oc-text-wrap" data-searchable="true">
              <Markdown
                text={text}
                notify={ctx.notify}
                className={`oc-prose chat-text${preview ? "" : " muted"}${part.streaming ? " is-streaming" : ""}`}
                onOpenLink={(href) => void openUrl(href)}
                workspacePath={ctx.workspacePath}
                onOpenFile={ctx.onOpenFile}
                Link={LinkWithMenu}
              />
            </div>
          </div>
        </div>
      );
    }
    case "thinking": {
      const text = assistantDisplayText(part.text, ctx.stripAbsolutelyRight);
      if (!text.trim()) return null;
      return <ThinkingRow id={`thinking:${partKey}`} text={text} streaming={part.streaming} group={group} ctx={ctx} />;
    }
    case "tool": {
      const { call } = part;
      return (
        // data-tool-input: the block's input as the agent reported it (paths marked local or cloud), for e2e checks.
        <div className={`chat-tool oc-tool-wrap status-${call.status}`} data-tool-group={group} data-tool-input={JSON.stringify(call.input ?? null)}>
          <ConductorToolRow
            tool={call.tool}
            status={call.status}
            result={call.result}
            isError={call.status === "error"}
            open={ctx.isOpen(call.id, opensByDefault(call.tool))}
            onToggle={() => ctx.onToggle(call.id, opensByDefault(call.tool))}
            todoRows={call.tool.name === "TodoWrite" ? {
              completed: { open: ctx.isOpen(`${call.id}-completed`), onToggle: () => ctx.onToggle(`${call.id}-completed`) },
              started: { open: ctx.isOpen(`${call.id}-started`), onToggle: () => ctx.onToggle(`${call.id}-started`) },
            } : undefined}
            workspacePath={ctx.workspacePath}
            onOpenFile={ctx.onOpenFile}
          />
        </div>
      );
    }
  }
}

/** `ppo`: a thinking block as a row, its text as a muted chip; open while it streams. */
function ThinkingRow({ id, text, streaming, group, ctx }: { id: string; text: string; streaming: boolean; group?: string; ctx: RowContext }) {
  const open = streaming || ctx.isOpen(id);
  return (
    <div className="chat-thinking oc-tool-wrap" data-tool-group={group}>
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
                <span className="oc-code-chip sans">{thinkingChipText(text)}</span>
              </div>
            ) : null}
          </div>
        </div>
        {open ? (
          <div className="oc-tool-content plain">
            <Markdown
              text={text}
              className={`oc-prose muted${streaming ? " is-streaming" : ""}`}
              onOpenLink={(href) => void openUrl(href)}
              Link={LinkWithMenu}
            />
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
    // Conductor's SimpleCopyButton (`t0`) shows the check and "Copied!" for 2s.
    setTimeout(() => setState("idle"), 2000);
  }
  const title = state === "copied" ? "Copied!" : state === "failed" ? "Couldn't copy" : label;
  return (
    <Tooltip content={title}>
      <button type="button" className="oc-icon-action" onClick={copy} aria-label={label}>
        <Lucide name={state === "copied" ? "check" : "copy"} className="oc-icon-action-svg" />
      </button>
    </Tooltip>
  );
}
