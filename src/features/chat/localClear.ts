import { invoke } from "@tauri-apps/api/core";
import { getSettings } from "../../settings/api";
import { saveAgent } from "./agentChoice.ts";
import { localModelOptions, saveModelChoice } from "./chatModelChoice.ts";
import { fastModeAvailable } from "./composerModels.ts";
import { defaultEffortSetting } from "./chatModel.ts";
import { CLAUDE_ENTRY, CODEX_ENTRY } from "./chatAgentChoice.ts";

export interface LocalChatReplacement {
  chatId: string;
  primaryChatId: string;
  title: string;
}

/** A new local identity, without resetting a provider or rewriting history. */
export async function clearLocalChat(workspaceId: string, chatId: string, agent: "claude" | "codex"): Promise<LocalChatReplacement> {
  const settings = await getSettings();
  const source = localModelOptions(chatId, agent);
  const effort = source.effort ?? defaultEffortSetting(settings, agent);
  const choice = source.model
    ? { agent, model: source.model, effort, fast: settings.models.default_fast_mode === true && fastModeAvailable(source.model) }
    : { ...(agent === "claude" ? CLAUDE_ENTRY : CODEX_ENTRY), effort };
  const result = await invoke<unknown>("db_clear_local_chat", { workspaceId, chatId, agent, model: source.model, effort });
  if (!result || typeof result !== "object" || !("chatId" in result) || typeof result.chatId !== "string" || result.chatId === chatId || !("primaryChatId" in result) || typeof result.primaryChatId !== "string" || !("title" in result) || typeof result.title !== "string") {
    throw new Error("Invalid local chat replacement");
  }
  saveModelChoice(result.chatId, choice);
  saveAgent(result.chatId, agent);
  return { chatId: result.chatId, primaryChatId: result.primaryChatId, title: result.title };
}
