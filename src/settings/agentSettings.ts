// Agent keys of settings.toml for the settings UI: Conductor's option lists
// and labels (read from its frontend bundle, evidence/settings/NOTES.md,
// "Models and providers"), the visible-models JSON, and the values the Big
// terminal presets take. Pure, so node --test covers it.

import type { ExecutablePaths } from "../features/terminal/bigTerminal.ts";
import type {
  ClaudePersonality,
  CodexPersonality,
  CodexToolApprovalPolicy,
  EffortLevel,
  Settings,
  ThinkingLevel,
} from "./types";

/** Conductor's `Aqt` labels, in its order. */
export const CLAUDE_OUTPUT_STYLES: readonly { value: ClaudePersonality; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "proactive", label: "Proactive" },
  { value: "concise", label: "Concise" },
  { value: "explanatory", label: "Explanatory" },
  { value: "learning", label: "Learning" },
];

/** Conductor's `lNe` order with its `Tqt` labels and `xqt` descriptions; unset shows as Pragmatic. */
export const CODEX_PERSONALITIES: readonly { value: CodexPersonality; label: string; description: string }[] = [
  { value: "pragmatic", label: "Pragmatic (default)", description: "Concise, task-focused, and direct" },
  { value: "friendly", label: "Friendly", description: "Warm, collaborative, and helpful" },
  { value: "none", label: "None", description: "No personality instructions" },
];

export const CLAUDE_EFFORT_LEVELS: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
export const CODEX_THINKING_LEVELS: readonly ThinkingLevel[] = ["none", "low", "medium", "high", "xhigh", "max", "ultra"];

export const CODEX_TOOL_APPROVALS: readonly { value: CodexToolApprovalPolicy; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "always_approve", label: "Always approve" },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const levelLabel = (l: string): string => (l === "xhigh" ? "Extra high" : cap(l));

/** Providers `visible_provider_models` keeps lists for, in Conductor's order (`RN`). */
export const VISIBLE_MODEL_PROVIDERS = ["claude", "codex", "cursor", "opencode", "pi"] as const;
export type VisibleModelProvider = (typeof VISIBLE_MODEL_PROVIDERS)[number];
export type VisibleModels = Record<VisibleModelProvider, string[]>;

const emptyVisible = (): VisibleModels => ({ claude: [], codex: [], cursor: [], opencode: [], pi: [] });

/**
 * `models.visible_provider_models` as provider -> model ids, read the way
 * Conductor reads it (`hee`): a JSON object of string arrays whose entries may
 * carry a `provider:` prefix; anything else is ignored.
 */
export function visibleModels(s: Settings): VisibleModels {
  const out = emptyVisible();
  const text = s.models.visible_provider_models;
  if (!text || !text.trim()) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return out;
  for (const provider of VISIBLE_MODEL_PROVIDERS) {
    const list = (parsed as Record<string, unknown>)[provider];
    if (!Array.isArray(list)) continue;
    const ids = list
      .filter((v): v is string => typeof v === "string")
      .map((v) => (v.startsWith(`${provider}:`) ? v.slice(provider.length + 1) : v).trim())
      .filter(Boolean);
    out[provider] = [...new Set(ids)];
  }
  return out;
}

/** A copy of `s` with one provider's visible models replaced, written as Conductor writes them (`fBe`). */
export function withVisibleModels(s: Settings, provider: VisibleModelProvider, ids: readonly string[]): Settings {
  const next = { ...visibleModels(s), [provider]: [...new Set(ids.map((i) => i.trim()).filter(Boolean))] };
  const all = VISIBLE_MODEL_PROVIDERS.every((p) => next[p].length === 0);
  const json = Object.fromEntries(VISIBLE_MODEL_PROVIDERS.map((p) => [p, next[p].map((id) => `${p}:${id}`)]));
  return { ...s, models: { ...s.models, visible_provider_models: all ? null : JSON.stringify(json) } };
}

/** The executable overrides the Big terminal presets use. */
export function executablePaths(s: Settings): ExecutablePaths {
  return {
    claude: s.claude_code_executable_path ?? undefined,
    codex: s.codex_executable_path ?? undefined,
    opencode: s.opencode_executable_path ?? undefined,
  };
}

/** A copy of `s` with a top-level text key set; blank means unset. */
export function withTopLevel(
  s: Settings,
  key: "claude_code_executable_path" | "codex_executable_path" | "opencode_executable_path" | "ssh_key_path",
  value: string,
): Settings {
  const v = value.trim();
  return { ...s, [key]: v === "" ? null : v };
}

/** A copy of `s` with a `[models.claude_code]` or `[models.codex]` field set. */
export function withAgentModel<A extends "claude_code" | "codex", K extends keyof NonNullable<Settings["models"][A]>>(
  s: Settings,
  agent: A,
  field: K,
  value: NonNullable<Settings["models"][A]>[K],
): Settings {
  return { ...s, models: { ...s.models, [agent]: { ...s.models[agent], [field]: value } } };
}
