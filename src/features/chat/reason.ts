// Reason chats: turns the `reason-chat-event` payloads the backend emits
// (`src-tauri/src/reason_acp/wire.rs`) into ChatEvents for the transcript.
//
// - Reason's events carry no turn id. Content goes to the newest open turn;
//   a `turnEnded` closes the oldest, because a follow-up sent mid-turn opens
//   a new turn before the earlier prompt reports `superseded`.
// - An error Reason sends as reply text fails the turn: it shows in the turn
//   footer (`turnEnded` carries the message), never as reply text.
// - A report (a message from another Session mid-turn) is its own message
//   with a sender, so it never renders as the user's input.
// - Tool rows keep the paths Reason reported, marked local or cloud with
//   the same repository-relative path.
// - A notice (e.g. a requested model Reason does not offer) is a system
//   message.
// - An interaction (a permission, plan or question the agent waits on) is
//   not transcript content; reasonChat.ts keeps it beside the transcript.
// Pure: no Tauri, no React, so `reason.test.ts` covers it.

import type { Block, ChatEvent, ChatMessage, TurnStatus } from "./types.ts";
import type { InteractionRequest } from "./interactions.ts";

export interface ReasonPath {
  raw: string;
  place: "local" | "cloud" | "other";
  relative: string | null;
  /** The cloud Session whose checkout holds the file. */
  sessionId?: string;
}

export interface ReasonTool {
  type: "tool";
  id: string;
  title: string;
  kind: string;
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  diffs: { path: ReasonPath; oldText: string | null; newText: string }[];
  locations: ReasonPath[];
}

export interface ReasonTurnEnd {
  outcome: "completed" | "cancelled" | "superseded" | "failed";
  message?: string;
}

export type ReasonPayload = { chatId: string } & (
  | { type: "sessionStarted"; sessionId: string }
  | { type: "text" | "thought" | "report" | "userReplay" | "notice"; text: string }
  | { type: "title"; title: string }
  | { type: "error"; code: string | null; status: number | null; message: string }
  | ReasonTool
  | { type: "turnEnded"; end: ReasonTurnEnd }
  /** The agent waits for the user (interactions.ts); not part of the transcript. */
  | { type: "interaction"; id: string; request: InteractionRequest }
  | { type: "interactionResolved"; id: string }
);

/** Sender recorded on reports; Reason does not say which Session sent one. */
export const REPORT_SENDER = "reason";

interface OpenTurn {
  turnId: string;
  /** The prompt; marked `cancelledAt` when the turn is stopped. */
  user: ChatMessage;
  assistant: ChatMessage | null;
}

export interface ReasonChatState {
  chatId: string;
  open: OpenTurn[];
  next: number;
}

export interface Step {
  state: ReasonChatState;
  events: ChatEvent[];
  /** Set by `sessionStarted`: save it to resume the chat after a restart. */
  sessionId?: string;
}

export function reasonChat(chatId: string): ReasonChatState {
  return { chatId, open: [], next: 1 };
}

function message(state: ReasonChatState, turnId: string, id: string, role: ChatMessage["role"], blocks: Block[], now: Date): ChatMessage {
  return { id, sessionId: state.chatId, turnId, role, createdAt: now.toISOString(), blocks };
}

/** A file sent with a prompt (as an embedded resource). */
export interface PromptAttachment {
  name: string;
  text: string;
}

/** Line the transcript shows for an attachment; the agent gets the file itself. */
export const attachmentLine = (name: string) => `Attached: ${name}`;

/**
 * The user's prompt: a new turn, running. Pass `turnId` to name the turn's
 * checkpoints (letters, digits, `.`, `_`, `-`); the default is only unique
 * within one app run. Attachments show by name.
 */
export function startTurn(state: ReasonChatState, text: string, now = new Date(), turnId = `${state.chatId}:t${state.next}`, attachments: PromptAttachment[] = []): Step {
  const blocks: Block[] = [{ type: "text", text }, ...attachments.map((a): Block => ({ type: "text", text: attachmentLine(a.name) }))];
  const user = message(state, turnId, `${turnId}:user`, "user", blocks, now);
  return {
    state: { ...state, open: [...state.open, { turnId, user, assistant: null }], next: state.next + 1 },
    events: [
      { type: "upsert", message: user },
      { type: "turn_status", sessionId: state.chatId, turnId, status: "running", at: now.toISOString() },
    ],
  };
}

/** The newest turn's id: the one `startTurn` just opened. */
export function newestTurn(state: ReasonChatState): string | undefined {
  return state.open[state.open.length - 1]?.turnId;
}

/** A turn whose prompt call failed, so no `turnEnded` will come for it. */
export function failTurn(state: ReasonChatState, turnId: string, error: string, now = new Date()): Step {
  return closeTurn(state, turnId, { outcome: "failed", message: error }, now);
}

/**
 * A turn stopped before its prompt reached Reason (the Stop came while the
 * chat was opening or the start checkpoint was being saved): Reason never
 * heard of it, so no `turnEnded` will come for it.
 */
export function cancelUnsent(state: ReasonChatState, turnId: string, now = new Date()): Step {
  return closeTurn(state, turnId, { outcome: "cancelled" }, now);
}

/** Turns still open after this one: a steered follow-up keeps the session working. */
export const openTurns = (state: ReasonChatState): number => state.open.length;

export function turnStatus(end: ReasonTurnEnd): { status: TurnStatus; error?: string } {
  switch (end.outcome) {
    case "failed":
      return { status: "failed", error: end.message ?? "Reason reported an error." };
    case "cancelled":
      return { status: "cancelled" };
    // The follow-up that took over carries the work on.
    case "superseded":
    case "completed":
      return { status: "completed" };
  }
}

function closeOldest(state: ReasonChatState, end: ReasonTurnEnd, now: Date): Step {
  const oldest = state.open[0];
  return oldest ? closeTurn(state, oldest.turnId, end, now) : { state, events: [] };
}

function closeTurn(state: ReasonChatState, turnId: string, end: ReasonTurnEnd, now: Date): Step {
  const turn = state.open.find((t) => t.turnId === turnId);
  if (!turn) return { state, events: [] };
  const s = turnStatus(end);
  const at = now.toISOString();
  const events: ChatEvent[] = [];
  // A stopped turn's prompt is marked cancelled, as Conductor's `session_messages.cancelled_at`.
  if (s.status === "cancelled") events.push({ type: "upsert", message: { ...turn.user, cancelledAt: at } });
  events.push({ type: "turn_status", sessionId: state.chatId, turnId, status: s.status, ...(s.error !== undefined ? { error: s.error } : {}), at });
  return { state: { ...state, open: state.open.filter((t) => t !== turn) }, events };
}

function toolInput(t: ReasonTool): unknown {
  const paths = [...t.locations, ...t.diffs.map((d) => d.path)];
  return { kind: t.kind, paths: paths.map((p) => ({ place: p.place, relative: p.relative, raw: p.raw, ...(p.sessionId ? { sessionId: p.sessionId } : {}) })) };
}

/** Blocks after applying one content payload to the assistant message. */
function withContent(blocks: Block[], p: ReasonPayload): Block[] {
  const last = blocks[blocks.length - 1];
  switch (p.type) {
    case "text":
    case "thought": {
      const type = p.type === "text" ? "text" : "thinking";
      if (last && last.type === type) return [...blocks.slice(0, -1), { type, text: last.text + p.text }];
      return [...blocks, { type, text: p.text }];
    }
    case "tool": {
      const use: Block = { type: "tool_use", id: p.id, name: p.title || p.kind, input: toolInput(p) };
      const done = p.status === "completed" || p.status === "failed";
      const result: Block = { type: "tool_result", toolUseId: p.id, content: p.output ?? "", isError: p.status === "failed" };
      const out = blocks.filter((b) => !(b.type === "tool_result" && b.toolUseId === p.id)).map((b) => (b.type === "tool_use" && b.id === p.id ? use : b));
      if (!out.includes(use)) out.push(use);
      if (done) out.splice(out.indexOf(use) + 1, 0, result);
      return out;
    }
    default:
      return blocks;
  }
}

export function applyReasonPayload(state: ReasonChatState, p: ReasonPayload, now = new Date()): Step {
  switch (p.type) {
    case "sessionStarted":
      return { state, events: [], sessionId: p.sessionId };
    case "turnEnded":
      return closeOldest(state, p.end, now);
    case "notice": {
      const turn = state.open[state.open.length - 1];
      const id = `${state.chatId}:n${state.next}`;
      const m = message(state, turn?.turnId ?? id, id, "system", [{ type: "text", text: p.text }], now);
      return { state: { ...state, next: state.next + 1 }, events: [{ type: "upsert", message: m }] };
    }
    case "report": {
      const turn = state.open[state.open.length - 1];
      const id = `${state.chatId}:r${state.next}`;
      const m = { ...message(state, turn?.turnId ?? id, id, "user", [{ type: "text", text: p.text }], now), senderSessionId: REPORT_SENDER };
      return { state: { ...state, next: state.next + 1 }, events: [{ type: "upsert", message: m }] };
    }
    case "text":
    case "thought":
    case "tool": {
      const turn = state.open[state.open.length - 1];
      if (!turn) return { state, events: [] };
      const prev = turn.assistant ?? message(state, turn.turnId, `${turn.turnId}:assistant`, "assistant", [], now);
      const assistant = { ...prev, blocks: withContent(prev.blocks, p) };
      const open = [...state.open.slice(0, -1), { ...turn, assistant }];
      return { state: { ...state, open }, events: [{ type: "upsert", message: assistant }] };
    }
    // The error also ends the turn as failed with its text; the app keeps its
    // own transcript, so replays and titles are not shown here.
    case "error":
    case "userReplay":
    case "title":
    // Waiting interactions are chat state, kept beside the transcript (reasonChat.ts).
    case "interaction":
    case "interactionResolved":
      return { state, events: [] };
  }
}
