// Runtime side of Codex chats: the Tauri commands in
// `src-tauri/src/codex_chat.rs`, the `codex-chat-event` stream, and one
// transcript, follow-up queue and approval list per chat. The chat id is the workspace id. The
// Codex thread id is saved per chat, so a chat reopened after a restart
// resumes its thread.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "./reducer.ts";
import * as Q from "./queue.ts";
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

export interface CodexSnapshot {
  transcript: ChatTranscript;
  queue: Q.ChatQueue;
  approvals: CodexApproval[];
}

interface Chat {
  state: CodexChatState;
  view: CodexSnapshot;
  cwd: string | null;
  opened: boolean;
  listeners: Set<(v: CodexSnapshot) => void>;
}

const chats = new Map<string, Chat>();
let listening: Promise<unknown> | null = null;

/** Codex chats need the desktop app. */
export const codexAvailable = (): boolean => isTauri();

/** The runner sends one prompt at a time, so a follow-up waits in the queue. */
export const CODEX_CAN_STEER = false;

function chat(chatId: string): Chat {
  let c = chats.get(chatId);
  if (!c) {
    c = { state: codexChat(chatId), view: { transcript: emptyTranscript(chatId), queue: Q.emptyQueue(), approvals: [] }, cwd: null, opened: false, listeners: new Set() };
    chats.set(chatId, c);
  }
  return c;
}

function publish(c: Chat, next: Partial<CodexSnapshot>) {
  c.view = { ...c.view, ...next, approvals: c.state.approvals };
  for (const fn of c.listeners) fn(c.view);
}

function apply(c: Chat, step: Step) {
  const approvalsChanged = step.state.approvals !== c.state.approvals;
  c.state = step.state;
  if (step.threadId) localStorage.setItem(threadKey(c.state.chatId), step.threadId);
  if (step.events.length === 0) {
    if (approvalsChanged) publish(c, {});
    return;
  }
  const r = applyChatEvents(c.view.transcript, step.events);
  if (!r.ok) {
    console.warn("codex chat: event not applied", r.error);
    return;
  }
  publish(c, { transcript: r.transcript });
  // A turn that ended moves the queue on: the next queued message may start.
  for (const e of step.events) {
    if (e.type !== "turn_status" || e.status === "running") continue;
    setQueue(c, Q.turnEnded(c.view.queue, e.status));
  }
}

function setQueue(c: Chat, step: Q.QueueStep | Q.ChatQueue) {
  const { queue, effects } = "effects" in step ? step : { queue: step, effects: [] };
  if (queue !== c.view.queue) publish(c, { queue });
  for (const e of effects) {
    // Codex cannot steer (`CODEX_CAN_STEER`), so a steer never comes from the composer.
    if (e.kind === "cancel") {
      if (c.opened) void invoke("codex_cancel", { chatId: c.state.chatId });
    } else void prompt(c, inlineAttachments(e.text, e.attachments));
  }
}

/** Codex takes plain text: attached files go inline after the message. */
function inlineAttachments(text: string, attached: readonly Q.MessageAttachment[]): string {
  return [text, ...attached.map((a) => `${a.name}:\n\`\`\`\n${a.text}\n\`\`\``)].join("\n\n");
}

function ensureListening(): Promise<unknown> {
  listening ??= listen<CodexPayload>(EVENT, ({ payload }) => {
    const c = chats.get(payload.chatId);
    if (c) apply(c, applyCodexPayload(c.state, payload));
  });
  return listening;
}

export function codexSnapshot(chatId: string): CodexSnapshot {
  return chat(chatId).view;
}

export function subscribeCodex(chatId: string, fn: (v: CodexSnapshot) => void): () => void {
  const c = chat(chatId);
  c.listeners.add(fn);
  return () => c.listeners.delete(fn);
}

/** Opens a turn and sends the prompt; `submitCodex` sets the folder first. */
async function prompt(c: Chat, text: string): Promise<void> {
  const chatId = c.state.chatId;
  apply(c, startTurn(c.state, text));
  const turnId = newestTurn(c.state)!;
  try {
    await ensureListening();
    if (!c.opened) {
      const policy = CODEX_ACCESS[codexAccess(chatId)].policy;
      await invoke("codex_open_chat", { chatId, cwd: c.cwd ?? "", threadId: localStorage.getItem(threadKey(chatId)), policy });
      c.opened = true;
    }
    // Resolves with the prompt's end; the `turnEnded` event closes the turn.
    await invoke("codex_prompt", { chatId, text });
  } catch (e) {
    // The prompt never reached Codex (no CLI, chat not open), so no event will end it.
    apply(c, failTurn(c.state, turnId, String(e)));
  }
}

/** The composer's Send, the first message or a Retry: starts when idle, else queues. `cwd` is the workspace folder. */
export function submitCodex(chatId: string, cwd: string, text: string, attachments: readonly Q.MessageAttachment[] = []): void {
  const c = chat(chatId);
  c.cwd = cwd;
  setQueue(c, Q.submit(c.view.queue, text, "queue", new Date(), attachments));
}

/** Stop: interrupts the running turn. */
export function stopCodex(chatId: string): void {
  const c = chat(chatId);
  setQueue(c, Q.stop(c.view.queue));
}

export function codexQueueAction(chatId: string, action: Q.QueueAction): void {
  const c = chat(chatId);
  setQueue(c, Q.actionStep(c.view.queue, action));
}

export async function answerCodex(chatId: string, requestId: number | string, decision: CodexDecision): Promise<void> {
  const c = chat(chatId);
  apply(c, { state: answered(c.state, requestId), events: [] });
  await invoke("codex_answer", { chatId, requestId, decision });
}
