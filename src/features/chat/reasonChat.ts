// Runtime side of Reason chats: the Tauri commands in
// `src-tauri/src/reason_chat.rs`, the `reason-chat-event` stream, and one
// transcript plus follow-up queue per chat. A workspace's own chat has the
// workspace id; other chats (reviews) get their own ids. The Reason Session id
// is saved per chat, so a chat reopened after a restart resumes its Session.
// A chat can ask for Session options (model, reasoning effort) before its
// first message.
//
// Turn lifecycle, Stop and the queue are decided by `queue.ts`; this file runs
// its effects. Reason steers natively: a prompt sent while a turn runs goes
// into that turn and the earlier prompt ends `superseded`.
//
// Outside the desktop app (the Vite preview) a stand-in agent answers each
// prompt after a short delay with a note that no agent runs there, so the
// queue and Stop can be exercised in a browser.
//
// Entry and exit points: `chat()` creates a chat's state; `apply()` is the only
// place transcript events land; `setQueue()` the only place the queue changes.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import { restoreCheckpoint, turnCheckpointRef } from "./checkpoints.ts";
import { applyReasonPayload, cancelUnsent, failTurn, openTurns, reasonChat, startTurn, type PromptAttachment, type ReasonChatState, type ReasonPayload, type Step } from "./reason.ts";
import * as Q from "./queue.ts";
import { turnChanges } from "../diff/useTurnChanges.ts";
import type { FileChange } from "../diff/types.ts";

/** One Reason Session config option (`model`, `reasoning_effort`). */
export interface ReasonConfig {
  id: string;
  value: string;
}

const EVENT = "reason-chat-event";
const sessionKey = (chatId: string) => `openconductor.reason.session.${chatId}`;

export interface ChatSnapshot {
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
}

interface Chat {
  state: ReasonChatState;
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  cwd: string | null;
  opened: boolean;
  config: ReasonConfig[];
  /** Turns shown as running whose prompt has not reached Reason yet. */
  unsent: Set<string>;
  /** Unsent turns the user stopped: they end cancelled instead of being sent. */
  stopped: Set<string>;
  listeners: Set<(s: ChatSnapshot) => void>;
}

const chats = new Map<string, Chat>();
let listening: Promise<unknown> | null = null;

/** Reason chats need the desktop app; the browser preview uses a stand-in agent. */
export const reasonAvailable = (): boolean => isTauri();

/** Reason steers a running turn with a follow-up. */
export const REASON_CAN_STEER = true;

function chat(chatId: string): Chat {
  let c = chats.get(chatId);
  if (!c) {
    c = { state: reasonChat(chatId), transcript: emptyTranscript(chatId), queue: Q.emptyQueue(), cwd: null, opened: false, config: [], unsent: new Set(), stopped: new Set(), listeners: new Set() };
    chats.set(chatId, c);
  }
  return c;
}

const snapshot = (c: Chat): ChatSnapshot => ({ transcript: c.transcript, queue: c.queue });
const notify = (c: Chat) => {
  const s = snapshot(c);
  for (const fn of c.listeners) fn(s);
};

function apply(c: Chat, step: Step) {
  c.state = step.state;
  if (step.sessionId) localStorage.setItem(sessionKey(c.state.chatId), step.sessionId);
  if (step.events.length === 0) return;
  const r = applyChatEvents(c.transcript, step.events);
  if (!r.ok) {
    console.warn("reason chat: event not applied", r.error);
    return;
  }
  c.transcript = r.transcript;
  notify(c);
  // A turn that ended moves the queue on: the next queued message may start.
  for (const e of step.events) {
    if (e.type !== "turn_status" || e.status === "running") continue;
    setQueue(c, Q.turnEnded(c.queue, e.status, openTurns(c.state) > 0));
  }
}

function setQueue(c: Chat, step: Q.QueueStep | Q.ChatQueue) {
  const { queue, effects } = "effects" in step ? step : { queue: step, effects: [] };
  if (queue !== c.queue) {
    c.queue = queue;
    notify(c);
  }
  for (const e of effects) run(c, e);
}

function run(c: Chat, effect: Q.Effect) {
  switch (effect.kind) {
    case "start":
    case "steer":
      void prompt(c, effect.text, [...effect.attachments]);
      return;
    case "cancel":
      // Reason cancels only a prompt it has; one still on its way is stopped here.
      for (const turnId of c.unsent) c.stopped.add(turnId);
      if (reasonAvailable()) void invoke("reason_cancel", { chatId: c.state.chatId });
      else preview.cancel(c);
      return;
  }
}

function ensureListening(): Promise<unknown> {
  listening ??= listen<ReasonPayload>(EVENT, ({ payload }) => {
    const c = chats.get(payload.chatId);
    if (c) apply(c, applyReasonPayload(c.state, payload));
  });
  return listening;
}

/**
 * Opens a turn in the transcript and sends the prompt; Reason steers it into
 * a running turn. The backend checkpoints the workspace before and after the
 * turn under this turn's id and answers with the files the turn changed, which
 * go to the turn-changes cache for the chips under the turn.
 */
async function prompt(c: Chat, text: string, attachments: PromptAttachment[]): Promise<void> {
  const chatId = c.state.chatId;
  // A random turn id, so a turn's checkpoints and cached changes never
  // collide with a turn from an earlier app run.
  const turnId = `${chatId}:${crypto.randomUUID()}`;
  apply(c, startTurn(c.state, text, new Date(), turnId, attachments));
  if (!reasonAvailable()) return preview.prompt(c, text);
  // `submitChat` sets the folder before any effect runs.
  const cwd = c.cwd ?? "";
  // Stop is shown from here on, but Reason only learns of the turn once
  // `reason_prompt` runs; a Stop before that is held in `c.stopped`.
  c.unsent.add(turnId);
  try {
    await ensureListening();
    if (!c.opened) {
      await invoke("reason_open_chat", { chatId, cwd, sessionId: localStorage.getItem(sessionKey(chatId)), config: c.config });
      c.opened = true;
    }
    c.unsent.delete(turnId);
    if (c.stopped.delete(turnId)) return apply(c, cancelUnsent(c.state, turnId));
    // Conductor snapshots the workspace around every turn: the backend saves
    // the `start` and `end` checkpoints (features/chat/checkpoints.ts names
    // them, so "Reset chat" finds them) and answers with the files the turn
    // changed. Resolves after the turn's `turnEnded` event; a rejection means
    // the turn never started (no CLI, no process), so no event will end it.
    const turn = turnCheckpointRef(chatId, turnId);
    const end = await invoke<{ turnChanges?: FileChange[] }>("reason_prompt", { chatId, text, attachments, turn });
    if (end.turnChanges) turnChanges.record(turn, end.turnChanges);
  } catch (e) {
    c.unsent.delete(turnId);
    c.stopped.delete(turnId);
    apply(c, failTurn(c.state, turnId, String(e)));
  }
}

/**
 * "Reset chat" to `turnId`: with `resetFiles`, restore the workspace to the
 * turn's end checkpoint first; only when that worked, delete the later
 * messages. The Reason Session itself is not rewound: ACP has no way to drop
 * turns from a Session, so the agent still remembers the deleted ones.
 */
export async function resetReasonChat(chatId: string, cwd: string, turnId: string, resetFiles: boolean): Promise<void> {
  const c = chat(chatId);
  if (c.transcript.activeTurn !== null) throw new Error("Stop the agent before resetting the chat.");
  await restoreCheckpoint(invoke, cwd, chatId, turnId, resetFiles);
  c.transcript = truncateAfterTurn(c.transcript, turnId);
  notify(c);
}

export function chatSnapshot(chatId: string): ChatSnapshot {
  return snapshot(chat(chatId));
}

export function subscribeChat(chatId: string, fn: (s: ChatSnapshot) => void): () => void {
  const c = chat(chatId);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

/**
 * The composer's Send: starts a turn, steers the running one, or queues, per
 * `mode`. `cwd` is the workspace folder. Attachments go as embedded files and
 * show by name.
 */
export function submitChat(chatId: string, cwd: string, text: string, mode: Q.SendMode, attachments: readonly PromptAttachment[] = []): void {
  const c = chat(chatId);
  c.cwd = cwd;
  setQueue(c, Q.submit(c.queue, text, mode, new Date(), attachments));
}

/** The first message or a Retry: starts when idle, else waits in the queue. */
export function sendReason(chatId: string, cwd: string, text: string, attachments: readonly PromptAttachment[] = []): void {
  submitChat(chatId, cwd, text, "queue", attachments);
}

/** Session options for a chat that has not sent its first message; set when Reason creates its Session. */
export function configureReason(chatId: string, config: ReasonConfig[]): void {
  chat(chatId).config = config;
}

/** Stop. A second Stop while the first is pending asks Reason to stop hard. */
export function stopChat(chatId: string): void {
  const c = chat(chatId);
  setQueue(c, Q.stop(c.queue));
}

export type QueueAction =
  | { kind: "delete"; id: string }
  | { kind: "steer"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "cancelEdit" }
  | { kind: "saveEdit"; text: string; steer: boolean }
  | { kind: "move"; id: string; by: -1 | 1 }
  | { kind: "reorder"; ids: string[] }
  | { kind: "pause" }
  | { kind: "resume" };

export function queueAction(chatId: string, action: QueueAction): void {
  const c = chat(chatId);
  const q = c.queue;
  switch (action.kind) {
    case "delete":
      return setQueue(c, Q.remove(q, action.id));
    case "steer":
      return setQueue(c, Q.steerQueued(q, action.id));
    case "edit":
      return setQueue(c, Q.beginEdit(q, action.id));
    case "cancelEdit":
      return setQueue(c, Q.cancelEdit(q));
    case "saveEdit":
      return setQueue(c, Q.saveEdit(q, action.text, action.steer));
    case "move":
      return setQueue(c, Q.move(q, action.id, action.by));
    case "reorder":
      return setQueue(c, Q.reorder(q, action.ids));
    case "pause":
      return setQueue(c, Q.pause(q));
    case "resume":
      return setQueue(c, Q.resume(q));
  }
}

// Stand-in agent for the browser preview: each prompt "works" for a moment,
// then replies that no agent runs here. A follow-up supersedes the running
// prompt, as Reason does.
const PREVIEW_TURN_MS = 2500;
const preview = {
  timers: new Map<string, ReturnType<typeof setTimeout>[]>(),
  prompt(c: Chat, text: string) {
    const chatId = c.state.chatId;
    const pending = this.timers.get(chatId) ?? [];
    // Supersede: the earlier prompt ends now and this one carries on.
    if (pending.length > 0) apply(c, applyReasonPayload(c.state, { chatId, type: "turnEnded", end: { outcome: "superseded" } }));
    const t = setTimeout(() => {
      this.timers.set(chatId, (this.timers.get(chatId) ?? []).filter((x) => x !== t));
      apply(c, applyReasonPayload(c.state, { chatId, type: "text", text: `Browser preview: no agent runs here, so "${text.slice(0, 60)}" was not sent. Reason runs chats in the desktop app.` }));
      apply(c, applyReasonPayload(c.state, { chatId, type: "turnEnded", end: { outcome: "completed" } }));
    }, PREVIEW_TURN_MS);
    this.timers.set(chatId, [t]);
  },
  cancel(c: Chat) {
    const chatId = c.state.chatId;
    for (const t of this.timers.get(chatId) ?? []) clearTimeout(t);
    this.timers.set(chatId, []);
    apply(c, applyReasonPayload(c.state, { chatId, type: "turnEnded", end: { outcome: "cancelled" } }));
  },
};
