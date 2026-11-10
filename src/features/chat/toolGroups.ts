// Collapsing a finished turn's work into "4 tool calls, 2 messages" rows, as
// Conductor does (evidence/chat/README.md, `_jt` / `Ntt` / `mjt` / `yjt` in its
// index chunk):
//
// - Plan/question messages are protected previews and always stay inline.
//   The final non-empty text is a preview unless a later request supersedes it.
// - The other items are batched between previews. A batch from 3 or more
//   visible messages becomes one summary row; shorter batches stay as they are.
// - A summary counts tool calls and other messages (text or thinking with
//   content); its label leaves out zero counts.
// - Nothing collapses while the turn runs, or when "Don't collapse tool calls"
//   is on. Otherwise a summary is closed until the user opens it.
// Pure: no React, so `toolGroups.test.ts` covers it.

import type { PartView, RowView } from "./view.ts";
import { plainText } from "./types.ts";

/** Conductor collapses a batch only when it has at least this many visible messages. */
export const MIN_COLLAPSED_ITEMS = 3;

export interface ToolSummary {
  id: string;
  toolCallsCount: number;
  otherMessagesCount: number;
  /** Distinct tool names in first-use order, for the row's icons. */
  toolNames: string[];
}

/** A part with a React key that stays stable across the turn's messages. */
export interface KeyedPart {
  key: string;
  messageKey: string;
  part: PartView;
}

/** `preview`: protected plan/question messages or the final text, drawn in full colour. */
export type GroupedPart = ({ kind: "part"; preview?: boolean } & KeyedPart) | { kind: "summary"; summary: ToolSummary; parts: KeyedPart[] };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "4 tool calls, 2 messages"; zero counts are left out. */
export function summaryLabel(s: Pick<ToolSummary, "toolCallsCount" | "otherMessagesCount">): string {
  const out: string[] = [];
  if (s.toolCallsCount > 0) out.push(plural(s.toolCallsCount, "tool call"));
  if (s.otherMessagesCount > 0) out.push(plural(s.otherMessagesCount, "message"));
  return out.join(", ");
}

function visible(part: PartView): boolean {
  return part.kind === "tool" || part.text.trim().length > 0;
}

/** Index of the final text, unless a later protected message supersedes it. */
function previewIndex(parts: KeyedPart[], protectedMessages: Set<string>): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    const { part, messageKey } = parts[i]!;
    if (protectedMessages.has(messageKey)) return -1;
    if (part.kind === "text" && part.text.trim()) return i;
  }
  return -1;
}

function summarize(id: string, batch: KeyedPart[]): ToolSummary | undefined {
  let toolCallsCount = 0;
  let otherMessagesCount = 0;
  const toolNames: string[] = [];
  for (const { part: p } of batch) {
    if (p.kind === "tool") {
      toolCallsCount++;
      if (!toolNames.includes(p.call.name)) toolNames.push(p.call.name);
    } else otherMessagesCount++;
  }
  if (toolCallsCount === 0 && otherMessagesCount === 0) return undefined;
  return { id, toolCallsCount, otherMessagesCount, toolNames };
}

/**
 * Groups a turn's parts. `hasFinalText` is false for a block that is not the
 * turn's last, so its text never counts as the turn's preview. `keyPrefix`
 * makes summary ids stable per turn.
 */
export function groupParts(parts: KeyedPart[], keyPrefix: string, hasFinalText = true): GroupedPart[] {
  const items = parts.filter((p) => visible(p.part));
  const protectedMessages = new Set(items
    .filter(({ part }) => part.kind === "tool" && (part.call.name === "ExitPlanMode" || part.call.name === "AskUserQuestion"))
    .map(({ messageKey }) => messageKey));
  const preview = hasFinalText ? previewIndex(items, protectedMessages) : -1;
  const out: GroupedPart[] = [];
  let batch: KeyedPart[] = [];
  let batchStart = 0;
  const flush = () => {
    if (batch.length === 0) return;
    const messageCount = new Set(batch.map((p) => p.messageKey)).size;
    const summary = messageCount >= MIN_COLLAPSED_ITEMS ? summarize(`${keyPrefix}:collapse-${batchStart}`, batch) : undefined;
    if (summary) out.push({ kind: "summary", summary, parts: batch });
    else for (const p of batch) out.push({ kind: "part", ...p });
    batch = [];
  };
  items.forEach((part, i) => {
    if (i === preview || protectedMessages.has(part.messageKey)) {
      flush();
      out.push({ kind: "part", ...part, preview: true });
      return;
    }
    if (batch.length === 0) batchStart = i;
    batch.push(part);
  });
  flush();
  return out;
}

/** Whether summaries may collapse at all: never while the turn runs or with "Don't collapse tool calls" on. */
export function canCollapse(turnRunning: boolean, dontCollapse: boolean): boolean {
  return !turnRunning && !dontCollapse;
}

/** A summary is open when it cannot collapse or the user opened it; closed by default. */
export function isSummaryOpen(collapsible: boolean, override: "expanded" | "collapsed" | undefined): boolean {
  if (!collapsible || override === "expanded") return true;
  return false;
}

/** A turn's consecutive assistant messages drawn as one block, as Conductor does. */
export interface AgentBlock {
  kind: "agent";
  key: string;
  turnId: string;
  /** The turn is still running, so nothing collapses. */
  running: boolean;
  /** Its last message is streaming. */
  streaming: boolean;
  /** No visible part yet (shows the typing indicator while streaming). */
  empty: boolean;
  items: GroupedPart[];
  /** Text for "Copy message": the block's last message, once it stops streaming. */
  copyText?: string;
}

export type DisplayRow = Exclude<RowView, { kind: "assistant" }> | AgentBlock;

type AssistantRow = Extract<RowView, { kind: "assistant" }>;

/**
 * Folds each run of assistant rows from one turn into an `AgentBlock` whose
 * parts are grouped with `groupParts`. Only the turn's last block has the
 * turn's final text as its preview.
 */
export function foldAgentRows(rows: RowView[], activeTurn: string | null | undefined): DisplayRow[] {
  const lastBlockStart = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.kind === "assistant" && rows[i - 1]?.kind === "assistant" && (rows[i - 1] as AssistantRow).message.turnId === r.message.turnId) return;
    if (r.kind === "assistant") lastBlockStart.set(r.message.turnId, i);
  });
  const out: DisplayRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.kind !== "assistant") {
      out.push(row);
      continue;
    }
    const turnId = row.message.turnId;
    const run: AssistantRow[] = [row];
    while (rows[i + 1]?.kind === "assistant" && (rows[i + 1] as AssistantRow).message.turnId === turnId) run.push(rows[++i] as AssistantRow);
    const parts = run.flatMap((r) => r.parts.map((part, j) => ({ key: part.kind === "tool" ? part.call.id : `${r.key}:${j}`, messageKey: r.key, part })));
    const last = run[run.length - 1]!;
    const items = groupParts(parts, `${turnId}:${row.key}`, lastBlockStart.get(turnId) === i - run.length + 1);
    const copyText = last.streaming ? "" : plainText(last.message);
    out.push({
      kind: "agent",
      key: row.key,
      turnId,
      running: turnId === activeTurn,
      streaming: last.streaming,
      empty: items.length === 0,
      items,
      ...(copyText ? { copyText } : {}),
    });
  }
  return out;
}
