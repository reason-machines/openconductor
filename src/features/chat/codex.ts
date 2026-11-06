// Codex chats: turns the `codex-chat-event` payloads the backend emits
// (`src-tauri/src/agent/codex_wire.rs`) into ChatEvents for the transcript,
// and keeps the chat's open approval prompts.
//
// - The backend runs one prompt at a time and ends each with exactly one
//   `turnEnded`, so content goes to the oldest open turn and `turnEnded`
//   closes it.
// - Codex streams each reply message and reasoning summary by item id, then
//   sends the whole item: one block per item, replaced when it completes.
//   Commentary messages (`phase: "commentary"`) stay between the tool rows
//   they introduce.
// - Tools are `tool_use` blocks; a finished one gets its `tool_result`
//   (declined and failed ones are errors).
// - Notices are system messages; a retrying notice ("Reconnecting... 2/5")
//   replaces the previous one of its turn.
// Pure: no Tauri, no React, so `codex.test.ts` covers it.

import type { Block, ChatEvent, ChatMessage, TurnStatus } from "./types.ts";

export type CodexDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export interface CodexTool {
  type: "tool";
  id: string;
  kind: string;
  title: string;
  status: "running" | "completed" | "failed" | "declined";
  input: unknown;
  output: string | null;
  exitCode: number | null;
}

export interface CodexApproval {
  type: "approval";
  requestId: number | string;
  kind: "command" | "fileChange";
  itemId: string;
  command: string | null;
  cwd: string | null;
  reason: string | null;
  decisions: CodexDecision[];
}

export interface CodexTurnEnd {
  outcome: "completed" | "cancelled" | "failed";
  message?: string;
}

export type CodexPayload = { chatId: string } & (
  | { type: "threadStarted"; threadId: string; resumed: boolean }
  | { type: "turnStarted"; turnId: string }
  | { type: "text" | "thought"; itemId: string; delta: string }
  | { type: "message"; itemId: string; text: string; phase: string | null }
  | { type: "thoughtDone"; itemId: string; text: string }
  | CodexTool
  | { type: "toolOutput"; id: string; delta: string }
  | CodexApproval
  | { type: "approvalResolved"; requestId: number | string }
  | { type: "notice"; message: string; willRetry: boolean }
  | ({ type: "turnEnded" } & CodexTurnEnd)
);

interface OpenTurn {
  turnId: string;
  assistant: ChatMessage | null;
  /** Codex item id -> index of its text or thinking block. */
  items: Record<string, number>;
}

export interface CodexChatState {
  chatId: string;
  open: OpenTurn[];
  approvals: CodexApproval[];
  next: number;
}

export interface Step {
  state: CodexChatState;
  events: ChatEvent[];
  /** Set by `threadStarted`: save it to resume the chat after a restart. */
  threadId?: string;
}

export function codexChat(chatId: string): CodexChatState {
  return { chatId, open: [], approvals: [], next: 1 };
}

function message(state: CodexChatState, turnId: string, id: string, role: ChatMessage["role"], blocks: Block[], now: Date): ChatMessage {
  return { id, sessionId: state.chatId, turnId, role, createdAt: now.toISOString(), blocks };
}

/** The user's prompt: a new turn, running (queued behind any open one). */
export function startTurn(state: CodexChatState, text: string, now = new Date()): Step {
  const turnId = `${state.chatId}:t${state.next}`;
  const user = message(state, turnId, `${turnId}:user`, "user", [{ type: "text", text }], now);
  return {
    state: { ...state, open: [...state.open, { turnId, assistant: null, items: {} }], next: state.next + 1 },
    events: [
      { type: "upsert", message: user },
      { type: "turn_status", sessionId: state.chatId, turnId, status: "running" },
    ],
  };
}

export function newestTurn(state: CodexChatState): string | undefined {
  return state.open[state.open.length - 1]?.turnId;
}

/** A turn whose prompt call failed, so no `turnEnded` will come for it. */
export function failTurn(state: CodexChatState, turnId: string, error: string): Step {
  if (!state.open.some((t) => t.turnId === turnId)) return { state, events: [] };
  return {
    state: { ...state, open: state.open.filter((t) => t.turnId !== turnId) },
    events: [{ type: "turn_status", sessionId: state.chatId, turnId, status: "failed", error }],
  };
}

export function turnStatus(end: CodexTurnEnd): { status: TurnStatus; error?: string } {
  switch (end.outcome) {
    case "failed":
      return { status: "failed", error: end.message ?? "Codex reported an error." };
    case "cancelled":
      return { status: "cancelled" };
    case "completed":
      return { status: "completed" };
  }
}

/** Sets the text or thinking block of `itemId`, appending or replacing. */
function withItemText(turn: OpenTurn, blocks: Block[], itemId: string, type: "text" | "thinking", text: string, append: boolean): { blocks: Block[]; items: Record<string, number> } {
  const at = turn.items[itemId];
  if (at === undefined) return { blocks: [...blocks, { type, text }], items: { ...turn.items, [itemId]: blocks.length } };
  const prev = blocks[at];
  const next = blocks.slice();
  next[at] = { type, text: append && prev && (prev.type === "text" || prev.type === "thinking") ? prev.text + text : text };
  return { blocks: next, items: turn.items };
}

function toolBlocks(blocks: Block[], t: CodexTool): Block[] {
  const use: Block = { type: "tool_use", id: t.id, name: t.title || t.kind, input: t.input };
  const out = blocks.filter((b) => !(b.type === "tool_result" && b.toolUseId === t.id)).map((b) => (b.type === "tool_use" && b.id === t.id ? use : b));
  if (!out.includes(use)) out.push(use);
  if (t.status !== "running") {
    let content = t.output ?? "";
    if (t.status === "declined") content = content || "Declined.";
    if (t.exitCode !== null && t.exitCode !== 0) content = `${content}${content ? "\n" : ""}Exit code ${t.exitCode}`;
    out.splice(out.indexOf(use) + 1, 0, { type: "tool_result", toolUseId: t.id, content, isError: t.status !== "completed" });
  }
  return out;
}

function updateAssistant(state: CodexChatState, now: Date, f: (turn: OpenTurn, blocks: Block[]) => { blocks: Block[]; items?: Record<string, number> }): Step {
  const turn = state.open[0];
  if (!turn) return { state, events: [] };
  const prev = turn.assistant ?? message(state, turn.turnId, `${turn.turnId}:assistant`, "assistant", [], now);
  const r = f(turn, prev.blocks);
  const assistant = { ...prev, blocks: r.blocks };
  const open = [{ ...turn, assistant, items: r.items ?? turn.items }, ...state.open.slice(1)];
  return { state: { ...state, open }, events: [{ type: "upsert", message: assistant }] };
}

export function applyCodexPayload(state: CodexChatState, p: CodexPayload, now = new Date()): Step {
  switch (p.type) {
    case "threadStarted":
      return { state, events: [], threadId: p.threadId };
    case "turnEnded": {
      const [oldest, ...rest] = state.open;
      if (!oldest) return { state, events: [] };
      const s = turnStatus(p);
      return {
        // Open approvals belong to the turn that just ended.
        state: { ...state, open: rest, approvals: [] },
        events: [{ type: "turn_status", sessionId: state.chatId, turnId: oldest.turnId, status: s.status, ...(s.error !== undefined ? { error: s.error } : {}) }],
      };
    }
    case "text":
    case "thought":
      return updateAssistant(state, now, (turn, blocks) => withItemText(turn, blocks, p.itemId, p.type === "text" ? "text" : "thinking", p.delta, true));
    case "message":
      return updateAssistant(state, now, (turn, blocks) => withItemText(turn, blocks, p.itemId, "text", p.text, false));
    case "thoughtDone":
      return updateAssistant(state, now, (turn, blocks) => withItemText(turn, blocks, p.itemId, "thinking", p.text, false));
    case "tool":
      return updateAssistant(state, now, (_turn, blocks) => ({ blocks: toolBlocks(blocks, p) }));
    case "approval": {
      const { chatId: _chat, ...approval } = p;
      const approvals = [...state.approvals.filter((a) => a.requestId !== p.requestId), approval];
      return { state: { ...state, approvals }, events: [] };
    }
    case "approvalResolved":
      return { state: { ...state, approvals: state.approvals.filter((a) => a.requestId !== p.requestId) }, events: [] };
    case "notice": {
      const turnId = state.open[0]?.turnId ?? `${state.chatId}:n${state.next}`;
      const id = p.willRetry ? `${turnId}:retry` : `${state.chatId}:n${state.next}`;
      const m = message(state, turnId, id, "system", [{ type: "text", text: p.message }], now);
      return { state: { ...state, next: state.next + 1 }, events: [{ type: "upsert", message: m }] };
    }
    // Output arrives whole with the finished tool.
    case "toolOutput":
    case "turnStarted":
      return { state, events: [] };
  }
}

/** Removes an approval once it is answered here. */
export function answered(state: CodexChatState, requestId: number | string): CodexChatState {
  return { ...state, approvals: state.approvals.filter((a) => a.requestId !== requestId) };
}

export const DECISION_LABELS: Record<CodexDecision, string> = {
  accept: "Allow",
  acceptForSession: "Allow for this chat",
  decline: "Deny",
  cancel: "Deny and stop",
};
