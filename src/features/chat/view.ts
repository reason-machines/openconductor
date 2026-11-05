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
import type { ChatMessage, MessageOrigin, TurnStatus } from "./types.ts";
import { messageOrigin, plainText } from "./types.ts";

export type ToolStatus = "running" | "done" | "error" | "interrupted";

export interface ToolCallView {
  id: string;
  name: string;
  input: unknown;
  status: ToolStatus;
  /** Result text once the tool has answered. */
  result?: string;
}

export type PartView =
  | { kind: "text"; text: string; streaming: boolean }
  | { kind: "thinking"; text: string; streaming: boolean }
  | { kind: "tool"; call: ToolCallView };

export type ReportOrigin = Extract<MessageOrigin, { kind: "session" } | { kind: "api_key" }>;

export type RowView =
  | { kind: "user"; key: string; message: ChatMessage; text: string }
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
      retryPrompt?: string;
      /** "Reset chat" applies: the turn has an agent reply and is not the chat's last turn. */
      canReset: boolean;
    };

interface ToolResult {
  content: string;
  isError: boolean;
}

function collectToolResults(messages: ChatMessage[]): Map<string, ToolResult> {
  const out = new Map<string, ToolResult>();
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.type === "tool_result") out.set(b.toolUseId, { content: b.content, isError: b.isError === true });
    }
  }
  return out;
}

function lastIndexByTurn(messages: ChatMessage[]): Map<string, number> {
  const out = new Map<string, number>();
  messages.forEach((m, i) => out.set(m.turnId, i));
  return out;
}

function assistantRow(message: ChatMessage, results: Map<string, ToolResult>, streaming: boolean, turnRunning: boolean): RowView {
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
        parts.push({ kind: "tool", call: { id: b.id, name: b.name, input: b.input, status, ...(r ? { result: r.content } : {}) } });
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
  const canRetry = state?.status === "failed" || state?.status === "cancelled";
  return {
    kind: "turn_end",
    key: `turn-end:${turnId}`,
    turnId,
    status: state?.status,
    ...(state?.error !== undefined ? { error: state.error } : {}),
    ...(finalText !== undefined ? { finalText } : {}),
    ...(canRetry && prompt ? { retryPrompt: plainText(prompt) } : {}),
    canReset: !isLastTurn && turnMessages.some((m) => m.role === "assistant"),
  };
}

export function buildRows(t: ChatTranscript): RowView[] {
  const { messages, activeTurn } = t;
  const results = collectToolResults(messages);
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
        const row = assistantRow(m, results, i === lastAssistant, m.turnId === activeTurn);
        if (row.kind === "assistant" && (row.parts.length > 0 || row.streaming)) rows.push(row);
        break;
      }
      case "session":
      case "api_key":
        rows.push({ kind: "report", key: m.id, message: m, origin, text });
        break;
      case "user":
        // Tool-result carriers have no text of their own.
        if (text.length > 0) rows.push({ kind: "user", key: m.id, message: m, text });
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
