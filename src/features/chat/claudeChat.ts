// Claude Code chats: the Claude Code backend for chatRuntime.ts. It runs the
// Tauri commands in `src-tauri/src/claude_chat/` (the signed-in `claude` CLI
// over stream-json) and turns the `claude-chat-event` stream into transcript
// steps; the events carry the same payloads as Reason chats (reason.ts), so
// the runtime, transcript and queue are the Reason ones.
//
// A message is sent as typed: "/name args" runs a Claude Code slash command
// or skill, as in the CLI. Claude Code takes a follow-up only after the turn
// ends (no steering). The transcript is kept for the app session only:
// conductor.db keeps one transcript per chat id, which the chat's Reason
// runtime owns.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { applyReasonPayload, type ReasonPayload } from "./reason.ts";
import { createChatRuntime, type ChatBackend } from "./chatRuntime.ts";
import { desktopHost } from "./desktopHost.ts";

const EVENT = "claude-chat-event";
const sessionKey = (chatId: string) => `openconductor.claude.session.${chatId}`;
const configKey = (chatId: string) => `openconductor.claude.config.${chatId}`;

/** Claude Code chats need the desktop app. */
export const claudeAvailable = (): boolean => isTauri();

const claudeBackend: ChatBackend<null> = {
  canSteer: false,
  defaultConfig: null,
  sessionKey,
  configKey,
  parseConfig: () => null,
  listen: (deliver) =>
    listen<ReasonPayload>(EVENT, ({ payload }) => {
      if (payload.type === "permissionRequest" || payload.type === "permissionResolved") return;
      deliver(payload.chatId, (s) => applyReasonPayload(s, payload));
    }),
  async open(chatId, cwd, sessionId) {
    await invoke("claude_open_chat", { chatId, cwd, sessionId });
  },
  prompt: ({ chatId, text }) => invoke("claude_prompt", { chatId, text }),
  cancel(chatId) {
    void invoke("claude_cancel", { chatId });
  },
};

const claude = createChatRuntime(claudeBackend, { ...desktopHost, persist: false });

export const claudeSnapshot = claude.snapshot;
export const subscribeClaude = claude.subscribe;
export const submitClaude = claude.submit;
export const stopClaude = claude.stop;
export const claudeQueueAction = claude.queueAction;
