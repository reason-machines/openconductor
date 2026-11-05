// Model and effort data for the composer's model picker, as Conductor 0.87.6
// ships it (index-BGEQ8YjU.js, evidence/chat/composer/README.md):
// - display names: the `lv` map ("opus-5-1m" → "Opus 5"),
// - effort levels per agent and per model: the `Uv` table, with labels
//   (`GLe` for Claude, `zLe` for Codex) and the submenu's axis label
//   ("Effort" for Claude, "Thinking" for Codex),
// - Fast mode: offered for Opus models and every Codex model (`Kc`).
// Pure: no React, no Tauri, so composerModels.test.ts covers it.

import { agentForModel, type ModelAgent } from "../../settings/models.ts";

/** Conductor's display names (`lv`). Ids it has no name for fall back to the id. */
const DISPLAY_NAMES: Record<string, string> = {
  "fable-5-1": "Fable 5.1",
  "fable-5": "Fable 5",
  "opus-5-5-1m": "Opus 5.5",
  "opus-5-1m": "Opus 5",
  "sonnet-5-5-1m": "Sonnet 5.5",
  "sonnet-5-1m": "Sonnet 5 1M",
  sonnet: "Sonnet 4.6",
  "opus-4-8": "Opus 4.8",
  "opus-4-8-1m": "Opus 4.8 1M",
  opus: "Opus 4.8",
  "opus-1m": "Opus 4.8 1M",
  "opus-4-7": "Opus 4.7",
  "opus-4-7-1m": "Opus 4.7 1M",
  "opus-4-6-1m": "Opus 4.6 1M",
  "sonnet-4-6-1m": "Sonnet 4.6 1M",
  "sonnet-4-6": "Sonnet 4.6",
  haiku: "Haiku 4.5",
  "haiku-4-5": "Haiku 4.5",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-6-astra": "GPT-6 Astra",
  "gpt-6-sol": "GPT-6 Sol",
  "gpt-6-luna": "GPT-6 Luna",
  "gpt-daybreak-blue-latest": "Daybreak Blue",
  "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.2-codex": "GPT-5.2 Codex",
  auto: "Auto",
  "composer-2.5": "Composer 2.5",
  "grok-4.7": "Grok 4.7",
  "grok-4.6": "Grok 4.6",
  "grok-4.5": "Grok 4.5",
};

/** The name the composer shows for a model id. */
export function modelDisplayName(model: string): string {
  return DISPLAY_NAMES[model] ?? model;
}

const CLAUDE_ALL = ["low", "medium", "high", "xhigh", "max", "ultracode"];
const CLAUDE_NO_X = ["low", "medium", "high", "max"];
const CLAUDE_TO_MAX = ["low", "medium", "high", "xhigh", "max"];
const CODEX_TO_X = ["none", "low", "medium", "high", "xhigh"];
const CODEX_TO_MAX = [...CODEX_TO_X, "max"];
const CODEX_ALL = [...CODEX_TO_MAX, "ultra"];
const CURSOR_LEVELS = ["low", "medium", "high", "xhigh"];

interface AgentEfforts {
  levels: string[];
  labels: Record<string, string>;
  axisLabel: string;
  defaultLevel: string;
  models: Record<string, { levels: string[]; labelOverrides?: Record<string, string> }>;
}

/** Conductor's `Uv`. */
const EFFORTS: Record<ModelAgent, AgentEfforts> = {
  claude: {
    levels: CLAUDE_ALL,
    labels: { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultracode: "Ultracode" },
    axisLabel: "Effort",
    defaultLevel: "high",
    models: {
      "fable-5-1": { levels: CLAUDE_ALL },
      "fable-5": { levels: CLAUDE_ALL },
      "opus-5-5-1m": { levels: CLAUDE_ALL },
      "opus-5-1m": { levels: CLAUDE_ALL },
      "opus-4-8-1m": { levels: CLAUDE_ALL },
      "opus-4-7-1m": { levels: CLAUDE_ALL },
      "opus-4-6-1m": { levels: CLAUDE_NO_X },
      "sonnet-5-5-1m": { levels: CLAUDE_TO_MAX },
      "sonnet-5-1m": { levels: CLAUDE_TO_MAX },
      "sonnet-4-6-1m": { levels: CLAUDE_NO_X },
      "sonnet-4-6": { levels: CLAUDE_NO_X },
      sonnet: { levels: CLAUDE_NO_X },
      "haiku-4-5": { levels: [] },
      haiku: { levels: [] },
      "opus-4-8": { levels: CLAUDE_ALL },
      "opus-4-7": { levels: CLAUDE_ALL },
      "opus-1m": { levels: CLAUDE_ALL },
      opus: { levels: CLAUDE_ALL },
    },
  },
  codex: {
    levels: CODEX_ALL,
    labels: { none: "Off", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max", ultra: "Ultra" },
    axisLabel: "Thinking",
    defaultLevel: "high",
    models: {
      "gpt-5.6-sol": { levels: CODEX_ALL, labelOverrides: { low: "Light" } },
      "gpt-5.6-terra": { levels: CODEX_ALL, labelOverrides: { low: "Light" } },
      "gpt-5.6-luna": { levels: CODEX_TO_MAX, labelOverrides: { low: "Light" } },
      "gpt-6-astra": { levels: CODEX_ALL },
      "gpt-6-sol": { levels: CODEX_ALL },
      "gpt-6-luna": { levels: CODEX_TO_MAX },
      "gpt-daybreak-blue-latest": { levels: CODEX_ALL },
      "gpt-5.5": { levels: CODEX_TO_X },
      "gpt-5.4": { levels: CODEX_TO_X },
      "gpt-5.3-codex-spark": { levels: CODEX_TO_X },
      "gpt-5.3-codex": { levels: CODEX_TO_X },
      "gpt-5.2-codex": { levels: CODEX_TO_X },
    },
  },
  cursor: {
    levels: CURSOR_LEVELS,
    labels: { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high" },
    axisLabel: "Effort",
    defaultLevel: "high",
    models: { auto: { levels: [] }, "composer-2.5": { levels: [] }, "grok-4.7": { levels: CURSOR_LEVELS } },
  },
};

export interface EffortOption {
  value: string;
  label: string;
}

export interface ModelEfforts {
  /** Submenu title: "Effort" (Claude, Cursor) or "Thinking" (Codex). */
  axisLabel: string;
  options: EffortOption[];
  defaultLevel: string;
}

/** The effort levels a model offers, in Conductor's order; none for a model without levels. */
export function modelEfforts(model: string): ModelEfforts | null {
  const agent = agentForModel(model);
  if (!agent) return null;
  const table = EFFORTS[agent];
  const entry = table.models[model];
  const levels = entry?.levels ?? table.levels;
  if (levels.length === 0) return null;
  const label = (l: string) => entry?.labelOverrides?.[l] ?? table.labels[l] ?? l;
  return { axisLabel: table.axisLabel, options: levels.map((value) => ({ value, label: label(value) })), defaultLevel: table.defaultLevel };
}

/** The effort a model actually runs at: the picked one if it offers it, else its agent's default. */
export function effectiveEffort(model: string, effort: string | null | undefined): string | null {
  const e = modelEfforts(model);
  if (!e) return null;
  if (effort && e.options.some((o) => o.value === effort)) return effort;
  return e.options.some((o) => o.value === e.defaultLevel) ? e.defaultLevel : (e.options.at(-1)?.value ?? null);
}

/** Label of an effort for a model ("High"), or null. */
export function effortLabel(model: string, effort: string | null | undefined): string | null {
  const value = effectiveEffort(model, effort);
  return modelEfforts(model)?.options.find((o) => o.value === value)?.label ?? null;
}

/** `chat.toggleThinking` ("Cycle effort"): the next level, wrapping to the first. */
export function nextEffort(model: string, effort: string | null | undefined): string | null {
  const e = modelEfforts(model);
  const current = effectiveEffort(model, effort);
  if (!e || current === null) return null;
  const i = e.options.findIndex((o) => o.value === current);
  return e.options[(i + 1) % e.options.length]!.value;
}

/** Fast mode is offered for Opus models and every Codex model (Conductor's `Kc`). */
export function fastModeAvailable(model: string): boolean {
  return model.startsWith("opus") || agentForModel(model) === "codex";
}

/** The composer's model chip: "Opus 5" and "High", plus "Fast" when on, for the accessible label. */
export function modelChip(model: string, effort: string | null | undefined, fast = false): { label: string; effort: string | null; accessible: string } {
  const label = modelDisplayName(model);
  const e = effortLabel(model, effort);
  return { label, effort: e, accessible: [label, e, fast && fastModeAvailable(model) ? "Fast" : null].filter(Boolean).join(" · ") };
}
