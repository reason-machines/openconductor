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
//
// In the desktop app each chat's transcript is kept in `conductor.db`
// (persist.ts): `stored()` loads it once when the chat is first used and
// saves every later change.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import { restoreCheckpoint, turnCheckpointRef } from "./checkpoints.ts";
import { applyReasonPayload, cancelUnsent, failTurn, openTurns, reasonChat, startTurn, type PromptAttachment, type ReasonChatState, type ReasonPayload, type Step } from "./reason.ts";
import * as Q from "./queue.ts";
import { ChatSaver, restoreEvents } from "./persist.ts";
import { earlierConversation, lastMessageOfTurn } from "./rewind.ts";
import { turnChanges } from "../diff/useTurnChanges.ts";
import type { FileChange } from "../diff/types.ts";
import { repoSettingsEffective } from "../../settings/repoSettings.ts";
import { withGeneralPreferences } from "../../settings/prompts.ts";

/** One Reason Session config option (`model`, `reasoning_effort`). */
export interface ReasonConfig {
  id: string;
  value: string;
}

const EVENT = "reason-chat-event";
const sessionKey = (chatId: string) => `openconductor.reason.session.${chatId}`;
/** The chat's picked Session options (`configureReason`), kept for a Session it opens later (after Reset chat). */
const configKey = (chatId: string) => `openconductor.reason.config.${chatId}`;

function savedConfig(chatId: string): ReasonConfig[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(configKey(chatId)) ?? "null");
    return Array.isArray(v) ? v.filter((o): o is ReasonConfig => typeof o?.id === "string" && typeof o?.value === "string") : null;
  } catch {
    return null;
  }
}

export interface ChatSnapshot {
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
}

interface Chat {
  state: ReasonChatState;
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  cwd: string | null;
  /** Repository the chat's workspace belongs to, for its effective `prompts.general`. */
  repoPath: string | null;
  opened: boolean;
  /** Options for the Session `session/new` creates (the first, or the one after Reset chat); the first prompt waits for them. */
  config: ReasonConfig[] | Promise<ReasonConfig[]>;
  /** The chat's options were picked (New workspace dialog, review model) or defaulted, so the default does not replace them. */
  configured: boolean;
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
    const saved = savedConfig(chatId);
    c = {
      state: reasonChat(chatId),
      transcript: emptyTranscript(chatId),
      queue: Q.emptyQueue(),
      cwd: null,
      repoPath: null,
      opened: false,
      config: saved ?? [],
      configured: saved !== null,
      unsent: new Set(),
      stopped: new Set(),
      listeners: new Set(),
    };
    chats.set(chatId, c);
  }
  stored(c);
  return c;
}

const savers = new Map<string, ChatSaver>();
/** Settles once a chat's stored transcript and Session id are in (or failed to load). */
const loads = new Map<string, Promise<void>>();

/**
 * The chat's saver; the first call loads the stored transcript into the chat.
 * Nothing else changes the transcript before the load settles: `prompt` waits
 * for it, so a message sent while loading lands after the stored turns and
 * goes to the stored Session.
 */
function stored(c: Chat): ChatSaver | undefined {
  if (!reasonAvailable()) return undefined;
  const chatId = c.state.chatId;
  let saver = savers.get(chatId);
  if (saver) return saver;
  saver = new ChatSaver((batch) => invoke("chat_messages_save", { chatId, ...batch, agentSessionId: localStorage.getItem(sessionKey(chatId)) }));
  savers.set(chatId, saver);
  const s = saver;
  const load = invoke<{ messages: string[]; agentSessionId: string | null }>("chat_messages_load", { chatId })
    .then(({ messages, agentSessionId }) => {
      if (agentSessionId && !localStorage.getItem(sessionKey(chatId))) localStorage.setItem(sessionKey(chatId), agentSessionId);
      if (messages.length === 0) return;
      const r = applyChatEvents(c.transcript, restoreEvents(chatId, messages));
      if (!r.ok) return console.warn("chat: stored transcript not applied", r.error);
      c.transcript = r.transcript;
      s.loaded(c.transcript);
      notify(c);
    })
    .catch((e) => console.warn("chat: stored transcript not loaded", e));
  loads.set(chatId, load);
  return saver;
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
  savers.get(c.state.chatId)?.update(c.transcript);
  notify(c);
  // A turn that ended moves the queue on: the next queued message may start.
  for (const e of step.events) {
    if (e.type !== "turn_status" || e.status === "running") continue;
    setQueue(c, Q.turnEnded(c.queue, e.status, openTurns(c.state) > 0));
  }
}

// Every chat's session status (Conductor's `sessions.status`), so a sidebar
// row can show its workspace's agent while that workspace is not open: chats
// keep running here after their view unmounts. Closed (hidden) chats drop out,
// as Conductor folds only a workspace's visible sessions.
let statuses: ReadonlyMap<string, Q.SessionStatus> = new Map();
const hiddenChats = new Set<string>();
const statusListeners = new Set<() => void>();

function publishStatus(c: Chat) {
  const id = c.state.chatId;
  const status = hiddenChats.has(id) ? undefined : c.queue.status;
  if (statuses.get(id) === status) return;
  const next = new Map(statuses);
  if (status === undefined) next.delete(id);
  else next.set(id, status);
  statuses = next;
  for (const fn of statusListeners) fn();
}

/** Chat id → session status of every visible chat; a new map on each change. */
export const chatStatuses = (): ReadonlyMap<string, Q.SessionStatus> => statuses;

export function subscribeChatStatuses(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

/** A closed chat tab: its agent no longer counts toward the workspace's status. */
export function hideChat(chatId: string): void {
  hiddenChats.add(chatId);
  const c = chats.get(chatId);
  if (c) publishStatus(c);
}

function setQueue(c: Chat, step: Q.QueueStep | Q.ChatQueue) {
  const { queue, effects } = "effects" in step ? step : { queue: step, effects: [] };
  if (queue !== c.queue) {
    c.queue = queue;
    notify(c);
    publishStatus(c);
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
 * go to the turn-changes cache for the chips under the turn. The first message
 * of a new chat also carries the repository's effective `prompts.general`, as
 * Conductor appends its general preferences to a new session's first message;
 * the transcript shows only what the user typed.
 */
async function prompt(c: Chat, text: string, attachments: PromptAttachment[]): Promise<void> {
  const chatId = c.state.chatId;
  // A random turn id, so a turn's checkpoints and cached changes never
  // collide with a turn from an earlier app run.
  const turnId = `${chatId}:${crypto.randomUUID()}`;
  if (!reasonAvailable()) {
    apply(c, startTurn(c.state, text, new Date(), turnId, attachments));
    return preview.prompt(c, text);
  }
  // Stop is shown from here on, but Reason only learns of the turn once
  // `reason_prompt` runs; a Stop before that is held in `c.stopped`.
  c.unsent.add(turnId);
  // The stored transcript and Session id come first (see `stored`).
  await loads.get(chatId);
  // No Session yet: a new chat, or one whose Session was dropped by Reset
  // chat. The new Session gets the conversation the chat still shows.
  const newSession = !c.opened && !localStorage.getItem(sessionKey(chatId));
  const isNewChat = newSession && !c.transcript.messages.some((m) => m.role === "user");
  const carried = newSession ? earlierConversation(c.transcript) : null;
  apply(c, startTurn(c.state, text, new Date(), turnId, attachments));
  // `submitChat` sets the folder before any effect runs.
  const cwd = c.cwd ?? "";
  try {
    await ensureListening();
    if (!c.opened) {
      const config = await c.config;
      await invoke("reason_open_chat", { chatId, cwd, sessionId: localStorage.getItem(sessionKey(chatId)), config });
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
    const agentText = isNewChat && c.repoPath ? await withGeneral(text, c.repoPath, cwd) : text;
    const end = await invoke<{ turnChanges?: FileChange[] }>("reason_prompt", { chatId, text: agentText, attachments: carried ? [carried, ...attachments] : attachments, turn });
    if (end.turnChanges) turnChanges.record(turn, end.turnChanges);
  } catch (e) {
    c.unsent.delete(turnId);
    c.stopped.delete(turnId);
    apply(c, failTurn(c.state, turnId, String(e)));
  }
}

async function withGeneral(text: string, repoPath: string, cwd: string): Promise<string> {
  try {
    const settings = await repoSettingsEffective(repoPath, cwd);
    return withGeneralPreferences(text, settings.prompts.general?.value);
  } catch (e) {
    console.warn("reason chat: general preferences not applied", e);
    return text;
  }
}

/**
 * "Reset chat" to `turnId`: with `resetFiles`, restore the workspace to the
 * turn's end checkpoint first; only when that worked, delete the later
 * messages. The agent is rewound too: a Reason Session cannot drop turns, so
 * when messages were deleted the chat forgets its Session (here and in
 * `conductor.db`, in the same write) and the next prompt opens a new one
 * carrying the kept conversation (rewind.ts).
 */
export async function resetReasonChat(chatId: string, cwd: string, turnId: string, resetFiles: boolean): Promise<void> {
  const c = chat(chatId);
  if (c.transcript.activeTurn !== null) throw new Error("Stop the agent before resetting the chat.");
  await restoreCheckpoint(invoke, cwd, chatId, turnId, resetFiles);
  const before = c.transcript;
  c.transcript = truncateAfterTurn(before, turnId);
  const lastKept = lastMessageOfTurn(c.transcript, turnId);
  const saver = savers.get(chatId);
  if (lastKept && c.transcript.messages.length < before.messages.length) {
    localStorage.removeItem(sessionKey(chatId));
    c.opened = false;
    saver?.rewind(c.transcript, lastKept);
  } else saver?.update(c.transcript);
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
 * `mode`. `cwd` is the workspace folder; `repoPath` its repository, whose
 * `prompts.general` goes with a new chat's first message. Attachments go as
 * embedded files and show by name.
 */
export function submitChat(chatId: string, cwd: string, text: string, mode: Q.SendMode, attachments: readonly PromptAttachment[] = [], repoPath?: string): void {
  const c = chat(chatId);
  c.cwd = cwd;
  if (repoPath) c.repoPath = repoPath;
  setQueue(c, Q.submit(c.queue, text, mode, new Date(), attachments));
}

/** The first message or a Retry: starts when idle, else waits in the queue. */
export function sendReason(chatId: string, cwd: string, text: string, attachments: readonly PromptAttachment[] = [], repoPath?: string): void {
  submitChat(chatId, cwd, text, "queue", attachments, repoPath);
}

/**
 * Session options for the chat's next new Session: its first, or the one
 * after Reset chat. A Session that already exists keeps its own. Picked
 * options are kept across restarts, so a Session opened after a reset still
 * runs on them.
 */
export function configureReason(chatId: string, config: ReasonConfig[]): void {
  const c = chat(chatId);
  c.config = config;
  c.configured = true;
  try {
    localStorage.setItem(configKey(chatId), JSON.stringify(config));
  } catch (e) {
    console.warn("reason chat: Session options not saved", e);
  }
}

/**
 * The options a chat starts with when none were picked (the default model);
 * the first prompt waits for them, and a failed lookup leaves Reason's default.
 */
export function configureReasonDefault(chatId: string, config: Promise<ReasonConfig[]>): void {
  const c = chat(chatId);
  if (c.configured || c.opened) return;
  c.config = config.catch(() => []);
  c.configured = true;
}

/** Stop. A second Stop while the first is pending asks Reason to stop hard. */
export function stopChat(chatId: string): void {
  const c = chat(chatId);
  setQueue(c, Q.stop(c.queue));
}

export type QueueAction = Q.QueueAction;

export function queueAction(chatId: string, action: QueueAction): void {
  const c = chat(chatId);
  setQueue(c, Q.actionStep(c.queue, action));
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
