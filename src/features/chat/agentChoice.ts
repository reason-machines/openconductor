// The agent picked for a chat (agents.ts), kept per chat in localStorage.

export type ChatAgentId = "reason" | "codex" | "claude";

const agentKey = (chatId: string) => `openconductor.agent.${chatId}`;

/** The agent picked for a chat; Reason when none was. */
export function savedAgent(chatId: string, storage: Pick<Storage, "getItem"> = localStorage): ChatAgentId {
  const v = storage.getItem(agentKey(chatId));
  return v === "codex" || v === "claude" ? v : "reason";
}

export function saveAgent(chatId: string, agent: ChatAgentId, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(agentKey(chatId), agent);
}
