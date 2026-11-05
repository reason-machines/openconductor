// Runtime side of Codex chats: the Tauri commands in
// `src-tauri/src/codex_chat.rs`, the `codex-chat-event` stream, and one
// transcript and approval list per chat. The chat id is the workspace id. The
// Codex thread id is saved per chat, so a chat reopened after a restart
// resumes its thread.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import { answered, applyCodexPayload, codexChat, failTurn, newestTurn, startTurn, type CodexApproval, type CodexChatState, type CodexDecision, type CodexPayload, type Step } from "./codex.ts";

const EVENT = "codex-chat-event";
const threadKey = (chatId: string) => `openconductor.codex.thread.${chatId}`;
const policyKey = (chatId: string) => `openconductor.codex.policy.${chatId}`;

/** Approval and sandbox for a Codex chat (`CodexPolicy` in codex_cli.rs). */
export interface CodexPolicy {
  approvalPolicy: "untrusted" | "on-request" | "never";
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
}

export type CodexAccess = "full" | "ask" | "read-only";

/** "full" is Conductor's default when a session sets neither (never, danger-full-access). */
export const CODEX_ACCESS: Record<CodexAccess, { label: string; policy: CodexPolicy }> = {
  full: { label: "Full access", policy: { approvalPolicy: "never", sandbox: "danger-full-access" } },
  ask: { label: "Ask first", policy: { approvalPolicy: "on-request", sandbox: "workspace-write" } },
  "read-only": { label: "Read only", policy: { approvalPolicy: "on-request", sandbox: "read-only" } },
};

export function codexAccess(chatId: string): CodexAccess {
  const v = localStorage.getItem(policyKey(chatId));
  return v === "ask" || v === "read-only" ? v : "full";
}

/** Saves the chat's access; an open chat restarts Codex on the same thread with it on the next prompt. */
export async function setCodexAccess(chatId: string, access: CodexAccess): Promise<void> {
  localStorage.setItem(policyKey(chatId), access);
  const c = chat(chatId);
  if (!c.opened) return;
  c.opened = false;
  await invoke("codex_close_chat", { chatId });
}

export interface CodexView {
  transcript: ChatTranscript;
  approvals: CodexApproval[];
}

interface Chat {
  state: CodexChatState;
  view: CodexView;
  opened: boolean;
  listeners: Set<(v: CodexView) => void>;
}

const chats = new Map<string, Chat>();
let listening: Promise<unknown> | null = null;

/** Codex chats need the desktop app. */
export const codexAvailable = (): boolean => isTauri();

function chat(chatId: string): Chat {
  let c = chats.get(chatId);
  if (!c) {
    c = { state: codexChat(chatId), view: { transcript: emptyTranscript(chatId), approvals: [] }, opened: false, listeners: new Set() };
    chats.set(chatId, c);
  }
  return c;
}

function publish(c: Chat, transcript: ChatTranscript) {
  c.view = { transcript, approvals: c.state.approvals };
  for (const fn of c.listeners) fn(c.view);
}

function apply(c: Chat, step: Step) {
  const approvalsChanged = step.state.approvals !== c.state.approvals;
  c.state = step.state;
  if (step.threadId) localStorage.setItem(threadKey(c.state.chatId), step.threadId);
  let transcript = c.view.transcript;
  if (step.events.length > 0) {
    const r = applyChatEvents(transcript, step.events);
    if (!r.ok) {
      console.warn("codex chat: event not applied", r.error);
      return;
    }
    transcript = r.transcript;
  } else if (!approvalsChanged) {
    return;
  }
  publish(c, transcript);
}

function ensureListening(): Promise<unknown> {
  listening ??= listen<CodexPayload>(EVENT, ({ payload }) => {
    const c = chats.get(payload.chatId);
    if (c) apply(c, applyCodexPayload(c.state, payload));
  });
  return listening;
}

export function codexView(chatId: string): CodexView {
  return chat(chatId).view;
}

export function subscribeCodex(chatId: string, fn: (v: CodexView) => void): () => void {
  const c = chat(chatId);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

/** Sends the first message or a follow-up; `cwd` is the workspace folder. */
export async function sendCodex(chatId: string, cwd: string, text: string): Promise<void> {
  const c = chat(chatId);
  apply(c, startTurn(c.state, text));
  const turnId = newestTurn(c.state)!;
  try {
    await ensureListening();
    if (!c.opened) {
      const policy = CODEX_ACCESS[codexAccess(chatId)].policy;
      await invoke("codex_open_chat", { chatId, cwd, threadId: localStorage.getItem(threadKey(chatId)), policy });
      c.opened = true;
    }
    // Resolves with the prompt's end; the `turnEnded` event closes the turn.
    await invoke("codex_prompt", { chatId, text });
  } catch (e) {
    // The prompt never reached Codex (no CLI, chat not open), so no event will end it.
    apply(c, failTurn(c.state, turnId, String(e)));
  }
}

export function stopCodex(chatId: string): void {
  if (chat(chatId).opened) void invoke("codex_cancel", { chatId });
}

export async function answerCodex(chatId: string, requestId: number | string, decision: CodexDecision): Promise<void> {
  const c = chat(chatId);
  apply(c, { state: answered(c.state, requestId), events: [] });
  await invoke("codex_answer", { chatId, requestId, decision });
}
