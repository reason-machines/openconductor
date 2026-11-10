// Which agent runs a workspace chat, picked from the composer's model picker.
// Conductor has no separate agent control: the chat's model decides its agent
// (renderApp: `agentType ?? gu(model)`), and the picker lists the models of
// every agent. Here Reason runs Conductor's model ids (Claude and GPT alike),
// while the Codex and Claude Code CLIs run with their own models, so the picker
// lists each CLI as one more entry ("Codex", "Claude Code") after the Reason
// models. Picking one makes the chat that agent's chat; picking any model makes
// it a Reason chat again.
// Pure: no React, no Tauri, so chatAgentChoice.test.ts covers it.

import type { ChatAgentId } from "./agentChoice.ts";
import type { ModelChoice } from "./composerModels.ts";

/** The picker entries that stand for the Codex and Claude Code CLIs. */
export const CODEX_ENTRY: ModelChoice = { model: "codex", effort: null };
export const CLAUDE_ENTRY: ModelChoice = { model: "claude-code", effort: null };

type CliAgent = Exclude<ChatAgentId, "reason">;
const CLI_AGENTS: Record<CliAgent, { entry: ModelChoice; label: string }> = {
  codex: { entry: CODEX_ENTRY, label: "Codex" },
  claude: { entry: CLAUDE_ENTRY, label: "Claude Code" },
};
const CLI_AGENT_IDS = Object.keys(CLI_AGENTS) as CliAgent[];

const cliAgentFor = (entry: ModelChoice): CliAgent | undefined => CLI_AGENT_IDS.find((id) => CLI_AGENTS[id].entry.model === entry.model);

/** The agent a picked entry runs on. */
export function agentForPick(pick: ModelChoice): ChatAgentId {
  return pick.agent ?? cliAgentFor(pick) ?? "reason";
}

/** Name for an entry that is not a Conductor model id. */
export function agentEntryLabel(entry: ModelChoice): string | undefined {
  const id = cliAgentFor(entry);
  return id ? CLI_AGENTS[id].label : undefined;
}

export interface PickerState {
  /** What the chip shows and the list checks. */
  value: ModelChoice;
  /** Shown on the chip instead of a model name (a Codex or Claude Code chat). */
  label?: string;
  /** Listed after the current entry. */
  favorites: ModelChoice[];
}

/**
 * The picker for a chat on `agent`: its Reason model (picked, else the default)
 * and, when the CLI agents can run here, their entries. A Codex or Claude Code
 * chat shows the agent's name on the chip with the Reason models listed to
 * switch back.
 */
export function pickerState(agent: ChatAgentId, reasonModel: ModelChoice, fallback: ModelChoice | null, agentsAvailable: boolean, loadout: readonly ModelChoice[] = []): PickerState {
  const availableLoadout = loadout.filter((pick) => agentsAvailable || agentForPick(pick) === agent);
  const reasonModels = [reasonModel, ...(fallback && fallback.model !== reasonModel.model ? [fallback] : [])];
  const others = agentsAvailable ? CLI_AGENT_IDS.filter((id) => id !== agent || reasonModel.agent === id).map((id) => CLI_AGENTS[id].entry) : [];
  if (agent !== "reason") {
    const local = reasonModel.agent === agent ? reasonModel : CLI_AGENTS[agent].entry;
    return { value: local, ...(local.agent ? {} : { label: CLI_AGENTS[agent].label }), favorites: [...availableLoadout, ...reasonModels, ...others] };
  }
  return { value: reasonModel, favorites: [...availableLoadout, ...reasonModels.slice(1), ...others] };
}
