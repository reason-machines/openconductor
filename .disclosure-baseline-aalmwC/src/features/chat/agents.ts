// The agents a chat can run in the desktop app, picked in the composer:
// Reason (reasonChat.ts), Codex (codexChat.ts) or Claude Code
// (claudeChat.ts). Each keeps its own transcript, queue and session, so
// switching agents shows that agent's chat and never mixes stored messages
// or sessions. The pick is kept per chat.

import type { ChatRuntime } from "./chatRuntime.ts";
import { answerPermission, chatSnapshot, queueAction, REASON_CAN_STEER, resetReasonChat, stopChat, submitChat, subscribeChat } from "./reasonChat.ts";
import { claudeChatId, claudeRuntime } from "./claudeChat.ts";
import { CODEX_CAN_STEER, codexQueueAction, codexSnapshot, stopCodex, submitCodex, subscribeCodex } from "./codexChat.ts";

import type { ChatAgentId } from "./agentChoice.ts";

export { saveAgent, savedAgent, type ChatAgentId } from "./agentChoice.ts";

/**
 * Reset chat and turn changes come from turn checkpoints; an agent without `reset` has none (Codex).
 * Reason and Claude Code ask mid-turn through permission requests (`answerPermission`): a tool, and for Claude Code
 * also a plan or questions. Codex asks through its own approvals and consent requests.
 */
export interface ChatAgent extends Pick<ChatRuntime<unknown>, "canSteer" | "snapshot" | "subscribe" | "submit" | "stop" | "queueAction">, Partial<Pick<ChatRuntime<unknown>, "reset" | "answerPermission">> {
  id: ChatAgentId;
  label: string;
  /** The agent's chat id for a chat shown under `chatId` (Claude Code's is `<chatId>:claude`). */
  chatId(chatId: string): string;
}

export const CHAT_AGENTS: Record<ChatAgentId, ChatAgent> = {
  reason: {
    id: "reason",
    label: "Reason",
    canSteer: REASON_CAN_STEER,
    snapshot: chatSnapshot,
    subscribe: subscribeChat,
    submit: submitChat,
    stop: stopChat,
    queueAction,
    reset: resetReasonChat,
    answerPermission,
    chatId: (id) => id,
  },
  codex: {
    id: "codex",
    label: "Codex",
    canSteer: CODEX_CAN_STEER,
    // Codex asks through its approvals (in its snapshot), never a permission request.
    snapshot: (chatId) => ({ ...codexSnapshot(chatId), permissions: [] }),
    subscribe: (chatId, fn) => subscribeCodex(chatId, (s) => fn({ ...s, permissions: [] })),
    // Codex gets attachments inline in the prompt; a follow-up always queues.
    submit: (chatId, cwd, input, _mode, attachments) => submitCodex(chatId, cwd, input, attachments),
    stop: stopCodex,
    queueAction: codexQueueAction,
    chatId: (id) => id,
  },
  claude: {
    id: "claude",
    label: "Claude Code",
    canSteer: claudeRuntime.canSteer,
    snapshot: claudeRuntime.snapshot,
    subscribe: claudeRuntime.subscribe,
    submit: claudeRuntime.submit,
    stop: claudeRuntime.stop,
    queueAction: claudeRuntime.queueAction,
    reset: claudeRuntime.reset,
    answerPermission: claudeRuntime.answerPermission,
    chatId: claudeChatId,
  },
};

export const CHAT_AGENT_IDS = Object.keys(CHAT_AGENTS) as ChatAgentId[];
