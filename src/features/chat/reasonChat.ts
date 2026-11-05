// Runtime side of Reason chats: the Tauri commands in
// `src-tauri/src/reason_chat.rs`, the `reason-chat-event` stream, and one
// transcript plus follow-up queue per chat. The chat id is the workspace id.
// The Reason Session id is saved per chat, so a chat reopened after a restart
// resumes its Session.
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
import { restoreCheckpoint, saveTurnCheckpoint } from "./checkpoints.ts";
import { applyReasonPayload, failTurn, newestTurn, openTurns, reasonChat, startTurn, type ReasonChatState, type ReasonPayload, type Step } from "./reason.ts";
import * as Q from "./queue.ts";

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
    c = { state: reasonChat(chatId), transcript: emptyTranscript(chatId), queue: Q.emptyQueue(), cwd: null, opened: false, listeners: new Set() };
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
      void prompt(c, effect.text);
      return;
    case "cancel":
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

/** Opens a turn in the transcript and sends the prompt; Reason steers it into a running turn. */
async function prompt(c: Chat, text: string): Promise<void> {
  const chatId = c.state.chatId;
  apply(c, startTurn(c.state, text));
  const turnId = newestTurn(c.state)!;
  if (!reasonAvailable()) return preview.prompt(c, text);
  // `submitChat` sets the folder before any effect runs.
  const cwd = c.cwd ?? "";
  try {
    await ensureListening();
    if (!c.opened) {
      await invoke("reason_open_chat", { chatId, cwd, sessionId: localStorage.getItem(sessionKey(chatId)) });
      c.opened = true;
    }
    // Conductor snapshots the workspace around every turn so "Reset chat"
    // can bring the files back (features/chat/checkpoints.ts).
    await saveTurnCheckpoint(invoke, cwd, chatId, turnId, "start");
    // Resolves after the turn's `turnEnded` event; a rejection means the
    // turn never started (no CLI, no process), so no event will end it.
    await invoke("reason_prompt", { chatId, text });
  } catch (e) {
    apply(c, failTurn(c.state, turnId, String(e)));
    return;
  }
  await saveTurnCheckpoint(invoke, cwd, chatId, turnId, "end");
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

/** @deprecated use `chatSnapshot`. */
export function reasonTranscript(chatId: string): ChatTranscript {
  return chat(chatId).transcript;
}

export function subscribeChat(chatId: string, fn: (s: ChatSnapshot) => void): () => void {
  const c = chat(chatId);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

/** The composer's Send: starts a turn, steers the running one, or queues, per `mode`. `cwd` is the workspace folder. */
export function submitChat(chatId: string, cwd: string, text: string, mode: Q.SendMode): void {
  const c = chat(chatId);
  c.cwd = cwd;
  setQueue(c, Q.submit(c.queue, text, mode));
}

/** The first message or a Retry: starts when idle, else waits in the queue. */
export function sendReason(chatId: string, cwd: string, text: string): void {
  submitChat(chatId, cwd, text, "queue");
}

/** Stop. A second Stop while the first is pending asks Reason to stop hard. */
export function stopChat(chatId: string): void {
  const c = chat(chatId);
  setQueue(c, Q.stop(c.queue));
}

/** @deprecated use `stopChat`. */
export const stopReason = stopChat;

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
