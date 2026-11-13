import { getSettings, updateSettings } from "../settings/api";
import { AGENT_DEFAULT_MODEL } from "../settings/models";
import { builtIn, withDefault } from "../settings/agents/loadout";
import type { AgentKind } from "../settings/types";

export async function selectFirstRunAgent(agent: AgentKind): Promise<void> {
  const settings = await getSettings();
  await updateSettings(withDefault(settings, { ...builtIn("default", agent === "reason" ? (settings.reason?.model ?? "openai/gpt-6.1-sol") : AGENT_DEFAULT_MODEL[agent]), agent }));
}
