// Model choices for Settings › Default models. Ids, lists and labels are
// Conductor's, read from its shipped frontend bundle (index-BGEQ8YjU.js:
// `Jf`/`BE`/`WE` Claude ids, `Yy`/`AN`/`IN` Codex ids and the label table `lv`;
// evidence/settings/NOTES.md, "Default models"). Conductor's Cursor and
// OpenCode models are left out: OpenConductor runs only Reason, Claude Code
// and Codex.

import type { AgentKind, Settings } from "./types";

/** Agents with a model catalog; Reason picks its own models. */
export type ModelAgent = Extract<AgentKind, "claude" | "codex">;

/**
 * The models each agent's column on the Default models page lists, in
 * Conductor's order (`Jf`, `Yy`): what its loadout palette shows.
 */
export const MODEL_PALETTE: Record<ModelAgent, string[]> = {
  claude: [
    "fable-5-1",
    "fable-5",
    "opus-5-5-1m",
    "opus-5-1m",
    "opus-4-8-1m",
    "opus-4-7-1m",
    "opus-4-6-1m",
    "sonnet-5-5-1m",
    "sonnet-5-1m",
    "sonnet-4-6-1m",
    "sonnet-4-6",
    "haiku-4-5",
  ],
  codex: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4"],
};

/** Every model id Conductor accepts per agent: the palette plus ids it keeps for stored settings (`BE`, `AN`, `IN`). */
export const MODEL_CATALOG: Record<ModelAgent, string[]> = {
  claude: [...MODEL_PALETTE.claude, "opus-4-8", "opus-4-7"],
  codex: [...MODEL_PALETTE.codex, "gpt-6-astra", "gpt-6-sol", "gpt-6-luna", "gpt-daybreak-blue-latest", "gpt-5.3-codex-spark", "gpt-5.3-codex", "gpt-5.2-codex"],
};

/** Conductor's display name per model id (`lv`), aliases included. */
export const MODEL_LABELS: Record<string, string> = {
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
};

/** Claude CLI aliases Conductor still accepts (our stored default is `opus`). */
export const CLAUDE_ALIASES = ["opus-1m", "opus", "sonnet", "haiku"];

export const AGENT_LABEL: Record<ModelAgent, string> = { claude: "Claude Code", codex: "Codex" };

/** Conductor's model for an agent when none is chosen. */
export const AGENT_DEFAULT_MODEL: Record<ModelAgent, string> = {
  claude: "opus-5-1m",
  codex: "gpt-5.6-sol",
};

/** The agent that runs a model id, or null for an id outside the catalog. */
export function agentForModel(model: string): ModelAgent | null {
  if (CLAUDE_ALIASES.includes(model)) return "claude";
  for (const agent of Object.keys(MODEL_CATALOG) as ModelAgent[]) {
    if (MODEL_CATALOG[agent].includes(model)) return agent;
  }
  return null;
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** A model's display name: Conductor's label, else one derived from the id (`my-model-2` is "My Model 2"). */
export function modelLabel(model: string): string {
  const known = MODEL_LABELS[model];
  if (known) return known;
  // Ids outside Conductor's table (e.g. a provider's "opus-5-5"): derive "Opus 5.5", "GPT-5.6 Sol".
  if (model.startsWith("gpt-")) {
    const [, version, ...rest] = model.split("-");
    return [`GPT-${/^\d/.test(version) ? version : cap(version)}`, ...rest.map(cap)].join(" ");
  }
  const parts = model.split("-");
  const oneM = parts.at(-1) === "1m";
  if (oneM) parts.pop();
  const [name, ...nums] = parts;
  if (!nums.every((n) => /^\d+$/.test(n))) return model.split("-").map(cap).join(" ");
  const version = nums.length ? ` ${nums.join(".")}` : "";
  return `${cap(name)}${version}${oneM ? " (1M)" : ""}`;
}

/** The default model when none is stored (the backend's `DEFAULT_MODEL`). */
export const DEFAULT_MODEL = "opus";

/**
 * Cursor's ids (`auto`, `composer-*`, `grok-*`), which Conductor offered and
 * OpenConductor no longer runs. A stored one reads as `DEFAULT_MODEL`, as the
 * backend reads it.
 */
export function isRemovedCursorModel(model: string): boolean {
  return model === "auto" || model.startsWith("composer-") || model.startsWith("grok-");
}

/** A stored `models.default`/`models.review` as it runs: a removed Cursor id reads as `DEFAULT_MODEL`. */
export function storedModel(model: string): string {
  return isRemovedCursorModel(model.trim()) ? DEFAULT_MODEL : model;
}

/** Agent and model a new chat starts with, from `models.default`. Unknown ids run on Claude. */
export function newChatModel(settings: Settings): { agent: ModelAgent; model: string } {
  const model = storedModel(settings.models.default);
  return { agent: agentForModel(model) ?? "claude", model };
}
