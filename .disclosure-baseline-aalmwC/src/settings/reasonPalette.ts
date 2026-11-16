import type { ReasonModelOption } from "../features/chat/reasonModels.ts";

// Verified against Reason's models_list on 2026-11-08. These are Reason IDs,
// not local Claude/Codex aliases, and remain discoverable before sign-in.
export const REASON_POPULAR: readonly ReasonModelOption[] = [
  { value: "byok:anthropic:claude-opus-5-5", name: "Opus 5.5" },
  { value: "byok:anthropic:claude-fable-5-1", name: "Fable 5.1" },
  { value: "byok:anthropic:claude-sonnet-5-5", name: "Sonnet 5.5" },
  { value: "byok:anthropic:claude-haiku-5-5", name: "Haiku 5.5" },
  { value: "byok:anthropic:claude-opus-4-8", name: "Opus 4.8" },
  { value: "byok:openai:gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { value: "byok:openai:gpt-6.1-terra", name: "GPT-6.1 Terra" },
  { value: "byok:openai:gpt-6-astra", name: "GPT-6 Astra" },
  { value: "byok:openai:gpt-6-luna", name: "GPT-6 Luna" },
];

export const LOADOUT_COLUMNS = ["reason", "claude", "codex"] as const;
export const LOADOUT_LABEL = { reason: "Reason Machines", claude: "Claude Code", codex: "Codex" };

export function isReasonModel(model: string): boolean {
  return model === "default" || model.startsWith("byok:") || /^[a-z][a-z0-9-]*\/.+/.test(model);
}

export function loadoutModelLabel(model: string): string | undefined {
  return REASON_POPULAR.find((m) => m.value === model)?.name;
}

/** The connected catalog's non-curated entries matching the search, without repeated IDs. */
export function otherReasonModels(connected: boolean, options: readonly ReasonModelOption[], search: string): ReasonModelOption[] {
  if (!connected) return [];
  const seen = new Set(REASON_POPULAR.map((m) => m.value));
  const query = search.trim().toLowerCase();
  return options.filter((model) => {
    if (seen.has(model.value)) return false;
    seen.add(model.value);
    return `${model.name} ${model.value}`.toLowerCase().includes(query);
  });
}
