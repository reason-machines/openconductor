// Model and effort for the create composer's picker (Conductor's composer
// model picker `RNi`, evidence/create-workspace/README.md "Create composer").
// The picker starts on Settings › Default models; choosing a model of another
// agent moves the effort to that agent's default. Pure, so node --test covers it.

import { CODEX_THINKING_LEVELS } from "../settings/agentSettings.ts";
import { agentForModel, newChatModel, type ModelAgent } from "../settings/models.ts";
import { CLAUDE_EFFORT_LEVELS, type Settings } from "../settings/types.ts";

export interface LaunchModel {
  agent: string;
  model: string;
  /** Claude effort or Codex thinking level; empty for an agent without levels. */
  effort: string;
}

/** Effort when Settings › Default models leaves it unset (the create flow's earlier fixed value). */
const FALLBACK_EFFORT = "high";

/** The levels the effort menu offers for an agent; none for Cursor and others. */
export function effortLevels(agent: string): readonly string[] {
  if (agent === "claude") return CLAUDE_EFFORT_LEVELS;
  if (agent === "codex") return CODEX_THINKING_LEVELS;
  return [];
}

/** An agent's default effort from settings, or the fallback when it has levels but none is set. */
function defaultEffort(agent: ModelAgent | string, settings: Settings | null): string {
  if (agent === "claude") return settings?.models.claude_code?.default_effort_level ?? FALLBACK_EFFORT;
  if (agent === "codex") return settings?.models.codex.default_thinking_level ?? FALLBACK_EFFORT;
  return "";
}

/** What a new create composer starts with: the default model and its agent's default effort. */
export function launchDefaults(settings: Settings | null): LaunchModel {
  if (!settings) return { agent: "claude", model: "opus", effort: FALLBACK_EFFORT };
  const { agent, model } = newChatModel(settings);
  return { agent, model, effort: defaultEffort(agent, settings) };
}

/**
 * Picks a model. The effort stays when the new model's agent offers it,
 * otherwise it becomes that agent's default.
 */
export function chooseModel(current: LaunchModel, model: string, settings: Settings | null): LaunchModel {
  const agent = agentForModel(model) ?? "claude";
  const effort = effortLevels(agent).includes(current.effort) ? current.effort : defaultEffort(agent, settings);
  return { agent, model, effort };
}
