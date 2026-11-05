// Which model and reasoning effort a chat's Reason Session runs on, from
// Conductor's model settings. Conductor starts every chat on a model and an
// effort: a new chat on `models.default` with the agent's default effort
// (`models.claude_code.default_effort_level` for Claude,
// `models.codex.default_thinking_level` for Codex), the Create-workspace
// dialog's first session on the model and effort picked there, and a review on
// `models.review` with the review effort. A Reason Session takes them as its
// `model` and `reasoning_effort` config options (`reason_open_chat`'s `config`).
// Pure: no Tauri, no React.

import { agentForModel, CLAUDE_ALIASES, modelLabel, type ModelAgent } from "../../settings/models.ts";
import type { Settings } from "../../settings/types.ts";

/** Reasoning levels a Reason Session offers (`reasoning_effort`). */
const REASON_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

/** One Reason Session config option, as `reason_open_chat` takes it. */
export interface ConfigChoice {
  id: string;
  value: string;
}

export interface SessionModel {
  /** The configured model (a Conductor model id, or a Reason model id). */
  model: string;
  /** Reason's id for it, or null when Reason has no match and its default runs. */
  reasonModel: string | null;
  /** Reasoning level, or null for Reason's default. */
  effort: string | null;
  /** Options for the chat's Session. */
  config: ConfigChoice[];
  /** Readable name, e.g. "Opus 5". */
  label: string;
}

/**
 * Reason's model id for a Conductor model id: Claude models run as
 * `byok:anthropic:claude-<name>` (Reason has no separate 1M-context ids),
 * Codex models as `byok:openai-codex:<id>`. An id that already names a
 * Reason model (`provider:model` or `provider/model`) is kept. Claude
 * aliases (`opus`, ...), Cursor and unknown ids have no fixed Reason id.
 */
export function reasonModelId(model: string): string | null {
  if (model.includes(":") || model.includes("/")) return model;
  if (CLAUDE_ALIASES.includes(model)) return null;
  switch (agentForModel(model)) {
    case "claude":
      return `byok:anthropic:claude-${model.replace(/-1m$/, "")}`;
    case "codex":
      return `byok:openai-codex:${model}`;
    default:
      return null;
  }
}

/** Reason's reasoning level for a Conductor effort setting; `ultracode` is beyond Reason's top level. */
export function reasonEffort(level: unknown): string | null {
  if (typeof level !== "string") return null;
  if (level === "ultracode") return "max";
  return REASON_EFFORTS.includes(level) ? level : null;
}

/** The agent whose effort setting applies: the catalog's, else the one a Reason id names. */
function agentOf(model: string, reasonModel: string | null): ModelAgent | null {
  return agentForModel(model) ?? (reasonModel?.includes("openai-codex") ? "codex" : reasonModel?.includes("anthropic") ? "claude" : null);
}

/**
 * A Session on `model`; `effortFor` picks the effort setting of the agent
 * that runs it (null for a model no agent claims).
 */
export function sessionModel(model: string, effortFor: (agent: ModelAgent | null) => unknown): SessionModel {
  const reasonModel = reasonModelId(model);
  const level = reasonEffort(effortFor(agentOf(model, reasonModel)));
  const config: ConfigChoice[] = [];
  if (reasonModel) config.push({ id: "model", value: reasonModel });
  if (level) config.push({ id: "reasoning_effort", value: level });
  const label = agentForModel(model) ? modelLabel(model) : model;
  return { model, reasonModel, effort: level, config, label };
}

/** An agent's effort setting for new chats, as Conductor stores it; null when it has none. */
export function defaultEffortSetting(settings: Settings, agent: ModelAgent | null): string | null {
  const level = agent === "claude" ? settings.models.claude_code?.default_effort_level : agent === "codex" ? settings.models.codex.default_thinking_level : null;
  return level ?? null;
}

/** A new chat: `models.default` with the default effort of the agent that runs it. */
export function chatModel(settings: Settings): SessionModel {
  return sessionModel(settings.models.default, (agent) => defaultEffortSetting(settings, agent));
}
