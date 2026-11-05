// Model choices for Settings › Default models. The catalog is Conductor's
// per-agent model list and its fallback per agent, read from its shipped
// frontend bundle (evidence/settings/NOTES.md, "Default models"). Labels are
// derived here: the bundle holds no display names for these ids.

import type { AgentKind, Settings } from "./types";

export type ModelAgent = Exclude<AgentKind, "opencode">;

export const MODEL_CATALOG: Record<ModelAgent, string[]> = {
  claude: [
    "fable-5-1",
    "fable-5",
    "opus-5-5-1m",
    "opus-5-1m",
    "opus-4-8-1m",
    "opus-4-8",
    "opus-4-7-1m",
    "opus-4-7",
    "opus-4-6-1m",
    "sonnet-5-5-1m",
    "sonnet-5-1m",
    "sonnet-4-6-1m",
    "sonnet-4-6",
    "haiku-4-5",
  ],
  codex: [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.3-codex-spark",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "gpt-daybreak-blue-latest",
  ],
  cursor: ["auto", "composer-2.5", "grok-4.7", "grok-4.6", "grok-4.5"],
};

/** Claude CLI aliases Conductor still accepts (our stored default is `opus`). */
export const CLAUDE_ALIASES = ["opus-1m", "opus", "sonnet", "haiku"];

export const AGENT_LABEL: Record<ModelAgent, string> = { claude: "Claude", codex: "Codex", cursor: "Cursor" };

/** Conductor's model for an agent when none is chosen. */
export const AGENT_DEFAULT_MODEL: Record<ModelAgent, string> = {
  claude: "opus-5-1m",
  codex: "gpt-5.6-sol",
  cursor: "composer-2.5",
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

/** A readable name for a model id: `opus-5-5-1m` is "Opus 5.5 (1M)", `gpt-5.6-sol` "GPT-5.6 Sol". */
export function modelLabel(model: string): string {
  if (model.startsWith("gpt-")) {
    const [, version, ...rest] = model.split("-");
    return [`GPT-${/^\d/.test(version) ? version : cap(version)}`, ...rest.map(cap)].join(" ");
  }
  const parts = model.split("-");
  const oneM = parts.at(-1) === "1m";
  if (oneM) parts.pop();
  const [name, ...nums] = parts;
  const version = nums.length ? ` ${nums.join(".")}` : "";
  return `${cap(name)}${version}${oneM ? " (1M)" : ""}`;
}

/** Agent and model a new chat starts with, from `models.default`. Unknown ids run on Claude. */
export function newChatModel(settings: Settings): { agent: ModelAgent; model: string } {
  const model = settings.models.default;
  return { agent: agentForModel(model) ?? "claude", model };
}
