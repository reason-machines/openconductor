// Which agent runs a workspace chat, picked from the composer's model picker.
// Conductor has no separate agent control: the chat's model decides its agent
// (renderApp: `agentType ?? gu(model)`), and the picker lists the models of
// every agent. Here Reason runs Conductor's model ids (Claude and GPT alike) and
// the Codex CLI runs with its own model, so the picker lists Codex as one more
// entry ("Codex") after the Reason models. Picking it makes the chat a Codex
// chat; picking any model makes it a Reason chat again.
// Pure: no React, no Tauri, so chatAgentChoice.test.ts covers it.

import type { ModelChoice } from "./composerModels.ts";

export type ChatAgent = "reason" | "codex";

/** The picker entry that stands for the Codex CLI. */
export const CODEX_ENTRY: ModelChoice = { model: "codex", effort: null };
export const CODEX_LABEL = "Codex";

/** The agent a picked entry runs on. */
export function agentForPick(pick: ModelChoice): ChatAgent {
  return pick.model === CODEX_ENTRY.model ? "codex" : "reason";
}

/** Name for an entry that is not a Conductor model id. */
export function agentEntryLabel(entry: ModelChoice): string | undefined {
  return entry.model === CODEX_ENTRY.model ? CODEX_LABEL : undefined;
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
 * and, when Codex can run here, the Codex entry. A Codex chat shows "Codex" on the
 * chip with the Reason model listed to switch back.
 */
export function pickerState(agent: ChatAgent, reasonModel: ModelChoice, fallback: ModelChoice | null, codexAvailable: boolean): PickerState {
  const reasonModels = [reasonModel, ...(fallback && fallback.model !== reasonModel.model ? [fallback] : [])];
  if (agent === "codex") return { value: CODEX_ENTRY, label: CODEX_LABEL, favorites: reasonModels };
  return { value: reasonModel, favorites: [...reasonModels.slice(1), ...(codexAvailable ? [CODEX_ENTRY] : [])] };
}
