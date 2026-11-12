// Render model for a chat transcript: what the transcript UI draws, computed
// from a `ChatTranscript` with no React in sight so it can be unit tested.
//
// - Tool results are folded into the tool call they answer (paired by
//   `toolUseId`), so a user-role message that only carries tool results never
//   renders as a user bubble.
// - Messages another session or an API key sent render as attributed reports,
//   never as the user's own input, including when they arrive mid-turn.
// - Each finished turn ends with a footer carrying the copy and retry data.

import type { ChatTranscript } from "./reducer.ts";
import { retryUserPrompt, type UserPrompt } from "./userContent.ts";
import { conductorTools, type ConductorTool } from "./conductorTools.ts";
import type { ChatMessage, MessageOrigin, TokenUsage, TurnStatus } from "./types.ts";
import { messageOrigin, plainText } from "./types.ts";

export type ToolStatus = "running" | "done" | "error" | "interrupted";

export interface ToolCallView {
  id: string;
  /** Conductor's tool name for the call (see conductorTools.ts). */
  name: string;
  input: unknown;
  /** The call as Conductor draws it: Claude Code's tool name and input. */
  tool: ConductorTool;
  status: ToolStatus;
  /** Result text once the tool has answered. */
  result?: string;
  rawResult?: unknown;
  resultCreatedAt?: string;
}

export type PartView =
  | { kind: "text"; text: string; streaming: boolean }
  | { kind: "thinking"; text: string; streaming: boolean }
  | { kind: "tool"; call: ToolCallView; hidden?: true };

export type ReportOrigin = Extract<MessageOrigin, { kind: "session" } | { kind: "api_key" }>;

export type RowView =
  /** `cancelled`: the prompt's turn was stopped (Conductor's `cancelled_at`), shown as a "Cancelled" caption. */
  | { kind: "user"; key: string; message: ChatMessage; text: string; cancelled: boolean }
  | { kind: "report"; key: string; message: ChatMessage; origin: ReportOrigin; text: string }
  | { kind: "system"; key: string; message: ChatMessage; text: string }
  | { kind: "assistant"; key: string; message: ChatMessage; parts: PartView[]; streaming: boolean }
  | {
      kind: "turn_end";
      key: string;
      turnId: string;
      status: TurnStatus | undefined;
      error?: string;
      /** Text for "copy final message": the turn's last assistant text. */
      finalText?: string;
      /** Set when the turn failed or was cancelled and has a user prompt to send again. */
      retryPrompt?: UserPrompt;
      /** "Reset chat" applies: the turn has an agent reply and is not the chat's last turn. */
      canReset: boolean;
      /** ISO times the turn started and ended, for the footer's "8m, 0s · 10:37 AM". */
      startedAt?: string;
      endedAt?: string;
      usage?: TokenUsage;
      model?: string;
    };

interface ToolResult {
  content: string;
  rawResult?: unknown;
  isError: boolean;
  resultCreatedAt?: string;
}

function collectToolResults(messages: ChatMessage[]): { results: Map<string, ToolResult>; failedByTurn: Map<string, Set<string>> } {
  const out = new Map<string, ToolResult>();
  const failedByTurn = new Map<string, Set<string>>();
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.type !== "tool_result") continue;
      out.set(b.toolUseId, { content: b.content, rawResult: b.rawResult, isError: b.isError === true, ...(b.resultCreatedAt !== undefined ? { resultCreatedAt: b.resultCreatedAt } : {}) });
      if (b.isError === true) {
        const failed = failedByTurn.get(m.turnId) ?? new Set<string>();
        failed.add(b.toolUseId);
        failedByTurn.set(m.turnId, failed);
      }
    }
  }
  return { results: out, failedByTurn };
}

function lastIndexByTurn(messages: ChatMessage[]): Map<string, number> {
  const out = new Map<string, number>();
  messages.forEach((m, i) => out.set(m.turnId, i));
  return out;
}

function assistantRow(message: ChatMessage, results: Map<string, ToolResult>, failedTools: ReadonlySet<string> | undefined, streaming: boolean, turnRunning: boolean): RowView {
  const parts: PartView[] = [];
  for (const b of message.blocks) {
    switch (b.type) {
      case "text":
      case "thinking":
        parts.push({ kind: b.type, text: b.text, streaming: false });
        break;
      case "tool_use": {
        const r = results.get(b.id);
        const status: ToolStatus = r ? (r.isError ? "error" : "done") : turnRunning ? "running" : "interrupted";
        // One Codex file change item edits several files: Conductor shows a row per file.
        const tools = conductorTools(b.name, b.input);
        tools.forEach((tool, j) => {
          const id = j === 0 ? b.id : `${b.id}#${j}`;
          const hidden = tool.name === "collab__wait" || (tool.name === "collab__closeAgent" && !failedTools?.has(b.id));
          parts.push({ kind: "tool", ...(hidden ? { hidden: true } : {}), call: { id, name: tool.name, input: b.input, tool, status, ...(r ? { result: r.content, rawResult: r.rawResult, ...(r.resultCreatedAt !== undefined ? { resultCreatedAt: r.resultCreatedAt } : {}) } : {}) } });
        });
        break;
      }
      case "tool_result":
        break;
    }
  }
  const last = parts[parts.length - 1];
  if (streaming && last && last.kind !== "tool") parts[parts.length - 1] = { ...last, streaming: true };
  return { kind: "assistant", key: message.id, message, parts, streaming };
}

function turnEnd(t: ChatTranscript, turnId: string, turnMessages: ChatMessage[], isLastTurn: boolean): RowView {
  const state = t.turns[turnId];
  let finalText: string | undefined;
  for (let i = turnMessages.length - 1; i >= 0 && finalText === undefined; i--) {
    const m = turnMessages[i]!;
    const text = m.role === "assistant" ? plainText(m) : "";
    if (text.length > 0) finalText = text;
  }
  const prompt = turnMessages.find((m) => messageOrigin(m).kind === "user" && plainText(m).length > 0);
  const model = turnMessages.find((m) => m.role === "assistant" && m.model)?.model
    ?? turnMessages.find((m) => messageOrigin(m).kind === "user")?.model;
  const canRetry = state?.status === "failed" || state?.status === "cancelled";
  let usage: TokenUsage | undefined;
  for (const m of turnMessages) {
    if (m.role !== "assistant" || !m.usage) continue;
    usage ??= {};
    if (m.usage.inputTokens !== undefined) usage.inputTokens = (usage.inputTokens ?? 0) + m.usage.inputTokens;
    if (m.usage.outputTokens !== undefined) usage.outputTokens = (usage.outputTokens ?? 0) + m.usage.outputTokens;
  }
  return {
    kind: "turn_end",
    key: `turn-end:${turnId}`,
    turnId,
    status: state?.status,
    ...(state?.error !== undefined ? { error: state.error } : {}),
    ...(finalText !== undefined ? { finalText } : {}),
    ...(canRetry && prompt ? { retryPrompt: retryUserPrompt(prompt) } : {}),
    ...(usage ? { usage } : {}),
    ...(model ? { model } : {}),
    canReset: !isLastTurn && turnMessages.some((m) => m.role === "assistant"),
    ...(state?.startedAt !== undefined ? { startedAt: state.startedAt } : {}),
    ...(state?.endedAt !== undefined ? { endedAt: state.endedAt } : {}),
  };
}

export function buildRows(t: ChatTranscript): RowView[] {
  const { messages, activeTurn } = t;
  const { results, failedByTurn } = collectToolResults(messages);
  const lastOfTurn = lastIndexByTurn(messages);
  let lastAssistant = -1;
  messages.forEach((m, i) => {
    if (m.role === "assistant" && m.turnId === activeTurn) lastAssistant = i;
  });

  // The chat's last turn (its newest message's turn, reports aside) has no "Reset chat".
  const turnIds = new Set([...Object.keys(t.turns), ...messages.filter((m) => m.role === "assistant").map((m) => m.turnId)]);
  let lastTurn: string | undefined;
  for (const m of messages) if (turnIds.has(m.turnId)) lastTurn = m.turnId;

  const rows: RowView[] = [];
  const turnMessages = new Map<string, ChatMessage[]>();
  messages.forEach((m, i) => {
    const group = turnMessages.get(m.turnId) ?? [];
    group.push(m);
    turnMessages.set(m.turnId, group);

    const origin = messageOrigin(m);
    const text = plainText(m);
    switch (origin.kind) {
      case "assistant": {
        const row = assistantRow(m, results, failedByTurn.get(m.turnId), i === lastAssistant, m.turnId === activeTurn);
        if (row.kind === "assistant" && (row.parts.some((part) => part.kind !== "tool" || !part.hidden) || row.streaming)) rows.push(row);
        break;
      }
      case "session":
      case "api_key":
        rows.push({ kind: "report", key: m.id, message: m, origin, text });
        break;
      case "user":
        // Tool-result carriers have no text of their own.
        if (text.length > 0) rows.push({ kind: "user", key: m.id, message: m, text, cancelled: m.cancelledAt !== undefined });
        break;
      case "system":
        if (text.length > 0) rows.push({ kind: "system", key: m.id, message: m, text });
        break;
    }
    // A report that carries its own turn id is not a turn of this chat: no footer for it.
    const isTurn = t.turns[m.turnId] !== undefined || group.some((g) => g.role === "assistant");
    if (lastOfTurn.get(m.turnId) === i && m.turnId !== activeTurn && isTurn) rows.push(turnEnd(t, m.turnId, group, m.turnId === lastTurn));
  });
  return rows;
}

/** Whether a tool row is open: the user's toggle wins, otherwise the "keep tool calls expanded" setting. */
export function isToolExpanded(toolId: string, toggled: ReadonlyMap<string, boolean>, expandByDefault: boolean): boolean {
  return toggled.get(toolId) ?? expandByDefault;
}
