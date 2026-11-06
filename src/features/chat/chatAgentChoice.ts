// Which agent runs a workspace chat, picked from the composer's model picker.
// Conductor has no separate agent control: the chat's model decides its agent
// (renderApp: `agentType ?? gu(model)`), and the picker lists the models of
// every agent. Here Reason runs Conductor's model ids (Claude and GPT alike) and
// the Codex CLI runs with its own model, so the picker lists Codex as one more
// entry ("Codex") after the Reason models, and Claude Code (the signed-in
// `claude` CLI, its own default model) as "Claude Code". Picking one makes the
// chat that agent's; picking any model makes it a Reason chat again.
// Pure: no React, no Tauri, so chatAgentChoice.test.ts covers it.

import type { ModelChoice } from "./composerModels.ts";

export type ChatAgent = "reason" | "codex" | "claude";

/** The picker entry that stands for the Codex CLI. */
export const CODEX_ENTRY: ModelChoice = { model: "codex", effort: null };
export const CODEX_LABEL = "Codex";
/** The picker entry that stands for the Claude Code CLI. */
export const CLAUDE_ENTRY: ModelChoice = { model: "claude-code", effort: null };
export const CLAUDE_LABEL = "Claude Code";

/** The agent a picked entry runs on. */
export function agentForPick(pick: ModelChoice): ChatAgent {
  return pick.model === CODEX_ENTRY.model ? "codex" : pick.model === CLAUDE_ENTRY.model ? "claude" : "reason";
}

/** Name for an entry that is not a Conductor model id. */
export function agentEntryLabel(entry: ModelChoice): string | undefined {
  return entry.model === CODEX_ENTRY.model ? CODEX_LABEL : entry.model === CLAUDE_ENTRY.model ? CLAUDE_LABEL : undefined;
}

export interface PickerState {
  /** What the chip shows and the list checks. */
  value: ModelChoice;
  /** Shown on the chip instead of a model name (a Codex chat). */
  label?: string;
  /** Listed after the current entry. */
  favorites: ModelChoice[];
}

/**
 * The picker for a chat on `agent`: its Reason model (picked, else the default)
 * and, when the CLI agents can run here, the Codex and Claude Code entries. A
 * Codex or Claude Code chat shows its name on the chip with the Reason models
 * and the other agent listed to switch.
 */
export function pickerState(agent: ChatAgent, reasonModel: ModelChoice, fallback: ModelChoice | null, codexAvailable: boolean): PickerState {
  const reasonModels = [reasonModel, ...(fallback && fallback.model !== reasonModel.model ? [fallback] : [])];
  if (agent === "codex") return { value: CODEX_ENTRY, label: CODEX_LABEL, favorites: [...reasonModels, CLAUDE_ENTRY] };
  if (agent === "claude") return { value: CLAUDE_ENTRY, label: CLAUDE_LABEL, favorites: [...reasonModels, CODEX_ENTRY] };
  return { value: reasonModel, favorites: [...reasonModels.slice(1), ...(codexAvailable ? [CODEX_ENTRY, CLAUDE_ENTRY] : [])] };
}
