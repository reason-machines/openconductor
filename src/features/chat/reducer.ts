// Ordered message list for one session, built by applying ChatEvents.
// Mirrors `src-tauri/src/chat/transcript.rs` so a subscriber that starts from a
// snapshot and applies every later event ends up with the backend's transcript.
// Unlike the Rust version this one is immutable: `applyChatEvent` returns a new
// transcript (sharing untouched messages) so React can compare by reference.

import type { Block, ChatEvent, ChatMessage, TurnStatus } from "./types.ts";
import { eventSessionId } from "./types.ts";

export interface TurnState {
  status: TurnStatus;
  error?: string;
}

export interface ChatTranscript {
  sessionId: string;
  messages: ChatMessage[];
  /** The turn that is currently running, if any. */
  activeTurn: string | null;
  /** Last status seen per turn id. */
  turns: Record<string, TurnState>;
}

export type ApplyError =
  | { kind: "wrong_session"; expected: string; got: string }
  | { kind: "unknown_message"; messageId: string }
  | { kind: "block_index_out_of_range"; messageId: string; index: number; len: number }
  | { kind: "not_a_text_block"; messageId: string; index: number };

export type ApplyResult = { ok: true; transcript: ChatTranscript } | { ok: false; error: ApplyError };

export function emptyTranscript(sessionId: string): ChatTranscript {
  return { sessionId, messages: [], activeTurn: null, turns: {} };
}

/** Builds a transcript from a snapshot of messages (e.g. loaded from `session_messages`). */
export function transcriptFromMessages(sessionId: string, messages: ChatMessage[]): ChatTranscript {
  const byId = new Map<string, number>();
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.sessionId !== sessionId) continue;
    const i = byId.get(m.id);
    if (i === undefined) {
      byId.set(m.id, out.length);
      out.push(m);
    } else {
      out[i] = m;
    }
  }
  return { ...emptyTranscript(sessionId), messages: out };
}

function indexOf(t: ChatTranscript, id: string): number {
  // Recent messages are the ones that stream, so search from the end.
  for (let i = t.messages.length - 1; i >= 0; i--) if (t.messages[i]!.id === id) return i;
  return -1;
}

function withMessage(t: ChatTranscript, i: number, message: ChatMessage): ChatTranscript {
  const messages = t.messages.slice();
  messages[i] = message;
  return { ...t, messages };
}

/** Applies one event. On error the transcript is unchanged and the error says why. */
export function applyChatEvent(t: ChatTranscript, event: ChatEvent): ApplyResult {
  const got = eventSessionId(event);
  if (got !== t.sessionId) return { ok: false, error: { kind: "wrong_session", expected: t.sessionId, got } };

  switch (event.type) {
    case "upsert": {
      const i = indexOf(t, event.message.id);
      const transcript = i < 0 ? { ...t, messages: [...t.messages, event.message] } : withMessage(t, i, event.message);
      return { ok: true, transcript };
    }
    case "text_delta": {
      const { messageId, blockIndex, delta } = event;
      const i = indexOf(t, messageId);
      if (i < 0) return { ok: false, error: { kind: "unknown_message", messageId } };
      const message = t.messages[i]!;
      const len = message.blocks.length;
      let blocks: Block[];
      if (blockIndex === len) {
        blocks = [...message.blocks, { type: "text", text: delta }];
      } else {
        const block = message.blocks[blockIndex];
        if (!block) return { ok: false, error: { kind: "block_index_out_of_range", messageId, index: blockIndex, len } };
        if (block.type !== "text" && block.type !== "thinking") {
          return { ok: false, error: { kind: "not_a_text_block", messageId, index: blockIndex } };
        }
        blocks = message.blocks.slice();
        blocks[blockIndex] = { ...block, text: block.text + delta };
      }
      return { ok: true, transcript: withMessage(t, i, { ...message, blocks }) };
    }
    case "turn_status": {
      const { turnId, status, error } = event;
      const turns = { ...t.turns, [turnId]: error === undefined ? { status } : { status, error } };
      let activeTurn = t.activeTurn;
      if (status === "running") activeTurn = turnId;
      else if (activeTurn === turnId) activeTurn = null;
      return { ok: true, transcript: { ...t, turns, activeTurn } };
    }
  }
}

/** Applies events in order, stopping at the first error. */
export function applyChatEvents(t: ChatTranscript, events: ChatEvent[]): ApplyResult {
  let cur = t;
  for (const e of events) {
    const r = applyChatEvent(cur, e);
    if (!r.ok) return r;
    cur = r.transcript;
  }
  return { ok: true, transcript: cur };
}

/**
 * "Reset chat" to `turnId`: drops every message after that turn's last one,
 * and the statuses of turns that no longer have messages (Conductor's
 * `deleteMessagesAfterWatermark`). Unknown turn: unchanged.
 */
export function truncateAfterTurn(t: ChatTranscript, turnId: string): ChatTranscript {
  let last = -1;
  t.messages.forEach((m, i) => {
    if (m.turnId === turnId) last = i;
  });
  if (last < 0) return t;
  const messages = t.messages.slice(0, last + 1);
  const kept = new Set(messages.map((m) => m.turnId));
  const turns = Object.fromEntries(Object.entries(t.turns).filter(([id]) => kept.has(id)));
  const activeTurn = t.activeTurn !== null && kept.has(t.activeTurn) ? t.activeTurn : null;
  return { ...t, messages, turns, activeTurn };
}
