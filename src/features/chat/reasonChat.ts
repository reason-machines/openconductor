// Runtime side of Reason chats: the Tauri commands in
// `src-tauri/src/reason_chat.rs`, the `reason-chat-event` stream, and one
// transcript per chat. The chat id is the workspace id. The Reason Session id
// is saved per chat, so a chat reopened after a restart resumes its Session.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { applyReasonPayload, failTurn, newestTurn, reasonChat, startTurn, type ReasonChatState, type ReasonPayload, type Step } from "./reason.ts";

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

/** Sends the first message or a follow-up; `cwd` is the workspace folder. */
export async function sendReason(chatId: string, cwd: string, text: string): Promise<void> {
  const c = chat(chatId);
  apply(c, startTurn(c.state, text));
  const turnId = newestTurn(c.state)!;
  try {
    await ensureListening();
    if (!c.opened) {
      await invoke("reason_open_chat", { chatId, cwd, sessionId: localStorage.getItem(sessionKey(chatId)) });
      c.opened = true;
    }
    // Resolves after the turn's `turnEnded` event; a rejection means the
    // turn never started (no CLI, no process), so no event will end it.
    await invoke("reason_prompt", { chatId, text });
  } catch (e) {
    apply(c, failTurn(c.state, turnId, String(e)));
  }
}

/** Stop. A second Stop asks Reason to stop hard. */
export function stopReason(chatId: string): void {
  void invoke("reason_cancel", { chatId });
}
