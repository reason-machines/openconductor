// Keeps a chat's transcript in `conductor.db` across restarts (issue #272),
// as Conductor keeps `sessions` and `session_messages`. The runtime
// (chatRuntime.ts) hands every new transcript to a `ChatSaver`, which writes
// the messages that changed and deletes the ones that went (Reset chat),
// batched; when a chat opens, `restoreEvents` turns the stored rows back into
// reducer events.
//
// Each row's `full_message` is the message JSON. The first message of each
// turn also carries the turn's state (status, error, start and end), so a
// failed or stopped turn reloads as it was. A turn still running when the app
// quit reloads as cancelled: nothing will end it anymore.
//
// Pure apart from `ChatSaver`'s timer and the `save` function it is given.

import type { ChatTranscript, TurnState } from "./reducer.ts";
import { plainText, type ChatEvent, type ChatMessage } from "./types.ts";

/** A `session_messages` row as `chat_messages_save` takes it. */
export interface StoredMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  turnId: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  senderSessionId: string | null;
  senderApiKeyName: string | null;
  fullMessage: string;
}

export interface SaveBatch {
  upserts: StoredMessage[];
  deleteIds: string[];
}

/** The message JSON kept in `full_message`. */
type FullMessage = ChatMessage & { turn?: TurnState };

/** Ids of each turn's first message, which carries the turn's state. */
function turnHeads(t: ChatTranscript): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of t.messages) if (!out.has(m.turnId)) out.set(m.turnId, m.id);
  return out;
}

function stored(m: ChatMessage, turn: TurnState | undefined): StoredMessage {
  const full: FullMessage = turn ? { ...m, turn } : m;
  return {
    id: m.id,
    role: m.role,
    content: plainText(m),
    createdAt: m.createdAt,
    turnId: m.turnId,
    sentAt: m.createdAt,
    cancelledAt: m.cancelledAt ?? null,
    senderSessionId: m.senderSessionId ?? null,
    senderApiKeyName: m.senderApiKeyName ?? null,
    fullMessage: JSON.stringify(full),
  };
}

/**
 * What to write to go from `prev` (what is stored) to `next`: messages that
 * are new or changed (the reducer replaces a message object when it changes),
 * a turn's first message again when its turn state changed, and the ids of
 * messages that are gone.
 */
export function diffForSave(prev: ChatTranscript | null, next: ChatTranscript): SaveBatch {
  const before = new Map((prev?.messages ?? []).map((m) => [m.id, m]));
  const prevHeads = prev ? turnHeads(prev) : new Map<string, string>();
  const heads = turnHeads(next);
  const upserts: StoredMessage[] = [];
  for (const m of next.messages) {
    const isHead = heads.get(m.turnId) === m.id;
    const turn = isHead ? next.turns[m.turnId] : undefined;
    const changed = before.get(m.id) !== m;
    const turnChanged = isHead && (prevHeads.get(m.turnId) !== m.id || prev?.turns[m.turnId] !== turn);
    if (changed || turnChanged) upserts.push(stored(m, turn));
  }
  const kept = new Set(next.messages.map((m) => m.id));
  const deleteIds = [...before.keys()].filter((id) => !kept.has(id));
  return { upserts, deleteIds };
}

/** Reducer events that rebuild a chat from its stored `full_message` rows; unreadable rows are skipped. */
export function restoreEvents(chatId: string, rows: readonly string[]): ChatEvent[] {
  const messages: FullMessage[] = [];
  for (const row of rows) {
    try {
      const m = JSON.parse(row) as FullMessage;
      if (m && typeof m.id === "string" && Array.isArray(m.blocks)) messages.push({ ...m, sessionId: chatId });
    } catch {
      // A row this version cannot read is left out rather than failing the chat.
    }
  }
  const events: ChatEvent[] = [];
  const turns = new Map<string, TurnState | undefined>();
  for (const { turn, ...m } of messages) {
    if (!turns.has(m.turnId)) turns.set(m.turnId, turn);
    events.push({ type: "upsert", message: m });
  }
  for (const [turnId, turn] of turns) {
    if (!turn) continue;
    const status = turn.status === "running" ? "cancelled" : turn.status;
    events.push({ type: "turn_status", sessionId: chatId, turnId, status: "running", ...(turn.startedAt ? { at: turn.startedAt } : {}) });
    events.push({
      type: "turn_status",
      sessionId: chatId,
      turnId,
      status,
      ...(turn.error !== undefined ? { error: turn.error } : {}),
      ...((turn.endedAt ?? turn.startedAt) ? { at: (turn.endedAt ?? turn.startedAt)! } : {}),
    });
  }
  return events;
}

/**
 * Writes a chat's transcript as it changes, at most once per `delayMs`, and
 * never two writes at once. A failed write is retried with the next change.
 */
export class ChatSaver {
  private stored: ChatTranscript | null = null;
  private pending: ChatTranscript | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private readonly save: (batch: SaveBatch) => Promise<void>;
  private readonly delayMs: number;

  constructor(save: (batch: SaveBatch) => Promise<void>, delayMs = 300) {
    this.save = save;
    this.delayMs = delayMs;
  }

  /** The transcript that is already stored (a loaded chat), so it is not written again. */
  loaded(t: ChatTranscript): void {
    this.stored = t;
  }

  update(t: ChatTranscript): void {
    this.pending = t;
    if (!this.timer && !this.writing) this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = this.pending;
    if (!next || this.writing) return;
    this.pending = null;
    const batch = diffForSave(this.stored, next);
    let failed = false;
    if (batch.upserts.length > 0 || batch.deleteIds.length > 0) {
      this.writing = true;
      try {
        await this.save(batch);
        this.stored = next;
      } catch (e) {
        console.warn("chat: transcript not saved", e);
        this.pending ??= next;
        failed = true;
      } finally {
        this.writing = false;
      }
    } else this.stored = next;
    // A failed write waits for the next change instead of retrying in a loop.
    if (this.pending && !failed) this.update(this.pending);
  }
}
