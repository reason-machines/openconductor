// Runtime side of Reason chats: the Tauri commands in
// `src-tauri/src/reason_chat.rs`, the `reason-chat-event` stream, and one
// transcript per chat. The chat id is the workspace id. The Reason Session id
// is saved per chat, so a chat reopened after a restart resumes its Session.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, truncateAfterTurn, type ChatTranscript } from "./reducer.ts";
import { restoreCheckpoint, turnCheckpointRef } from "./checkpoints.ts";
import { applyReasonPayload, failTurn, reasonChat, startTurn, type ReasonChatState, type ReasonPayload, type Step } from "./reason.ts";
import { turnChanges } from "../diff/useTurnChanges.ts";
import type { FileChange } from "../diff/types.ts";

const EVENT = "reason-chat-event";
const sessionKey = (chatId: string) => `openconductor.reason.session.${chatId}`;

interface Chat {
  state: ReasonChatState;
  transcript: ChatTranscript;
  opened: boolean;
  listeners: Set<(t: ChatTranscript) => void>;
}

const chats = new Map<string, Chat>();
let listening: Promise<unknown> | null = null;

/** Reason chats need the desktop app; the browser preview keeps a local transcript. */
export const reasonAvailable = (): boolean => isTauri();

function chat(chatId: string): Chat {
  let c = chats.get(chatId);
  if (!c) {
    c = { state: reasonChat(chatId), transcript: emptyTranscript(chatId), opened: false, listeners: new Set() };
    chats.set(chatId, c);
  }
  return c;
}

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
  for (const fn of c.listeners) fn(c.transcript);
}

function ensureListening(): Promise<unknown> {
  listening ??= listen<ReasonPayload>(EVENT, ({ payload }) => {
    const c = chats.get(payload.chatId);
    if (c) apply(c, applyReasonPayload(c.state, payload));
  });
  return listening;
}

export function reasonTranscript(chatId: string): ChatTranscript {
  return chat(chatId).transcript;
}

export function subscribeReason(chatId: string, fn: (t: ChatTranscript) => void): () => void {
  const c = chat(chatId);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

/**
 * Sends the first message or a follow-up; `cwd` is the workspace folder. The
 * backend checkpoints `cwd` before and after the turn under this turn's id
 * and answers with the files the turn changed, which go to the turn-changes
 * cache for the chips under the turn.
 */
export async function sendReason(chatId: string, cwd: string, text: string): Promise<void> {
  const c = chat(chatId);
  // A random turn id, so a turn's checkpoints and cached changes never
  // collide with a turn from an earlier app run.
  const turnId = `${chatId}:${crypto.randomUUID()}`;
  apply(c, startTurn(c.state, text, new Date(), turnId));
  try {
    await ensureListening();
    if (!c.opened) {
      await invoke("reason_open_chat", { chatId, cwd, sessionId: localStorage.getItem(sessionKey(chatId)) });
      c.opened = true;
    }
    // Conductor snapshots the workspace around every turn: the backend saves
    // the `start` and `end` checkpoints (features/chat/checkpoints.ts names
    // them, so "Reset chat" finds them) and answers with the files the turn
    // changed. Resolves after the turn's `turnEnded` event; a rejection means
    // the turn never started (no CLI, no process), so no event will end it.
    const turn = turnCheckpointRef(chatId, turnId);
    const end = await invoke<{ turnChanges?: FileChange[] }>("reason_prompt", { chatId, text, turn });
    if (end.turnChanges) turnChanges.record(turn, end.turnChanges);
  } catch (e) {
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
  for (const fn of c.listeners) fn(c.transcript);
}

/** Stop. A second Stop asks Reason to stop hard. */
export function stopReason(chatId: string): void {
  void invoke("reason_cancel", { chatId });
}
