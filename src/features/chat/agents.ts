// The agents a workspace's own chat can run, picked in the composer: Reason
// (reasonChat.ts) or Claude Code (claudeChat.ts). Each runs on its own chat
// runtime (chatRuntime.ts) under its own chat id, so switching agents shows
// that agent's transcript and never mixes stored messages or sessions.
// Review chats always run Reason. The pick is kept per workspace.

import type { ChatRuntime } from "./chatRuntime.ts";
import { chatSnapshot, queueAction, REASON_CAN_STEER, resetReasonChat, stopChat, submitChat, subscribeChat } from "./reasonChat.ts";
import { claudeChatId, claudeRuntime } from "./claudeChat.ts";

export type ChatAgentId = "reason" | "claude";

export interface ChatAgent extends Pick<ChatRuntime<unknown>, "canSteer" | "snapshot" | "subscribe" | "submit" | "stop" | "queueAction" | "reset"> {
  id: ChatAgentId;
  label: string;
  /** The runtime's chat id for a chat shown under `chatId` (the workspace id for its own chat). */
  chatId(chatId: string): string;
  /** The empty chat's note on who runs it. */
  note: string;
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
    chatId: (id) => id,
    note: "Reason runs this chat: one Reason Session per workspace.",
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
    chatId: claudeChatId,
    note: "Claude Code runs this chat with your signed-in claude CLI.",
  },
};

export const CHAT_AGENT_IDS = Object.keys(CHAT_AGENTS) as ChatAgentId[];

const agentKey = (workspaceId: string) => `openconductor.chat.agent.${workspaceId}`;

/** The agent picked for a workspace's chat; Reason when none was. */
export function savedAgent(workspaceId: string, storage: Pick<Storage, "getItem"> = localStorage): ChatAgentId {
  const v = storage.getItem(agentKey(workspaceId));
  return v === "claude" ? "claude" : "reason";
}

export function saveAgent(workspaceId: string, agent: ChatAgentId, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(agentKey(workspaceId), agent);
}
