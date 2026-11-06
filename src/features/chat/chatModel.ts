// Session options (model, reasoning effort) for a workspace's own chat.
// Conductor starts a workspace's chat on the model and effort picked in the
// New workspace dialog, else on Settings › Default models' "Default model"
// ("Model for new chats", evidence/settings/NOTES.md). Reason takes them as
// Session config options (`model`, `reasoning_effort`) set right after
// `session/new` (src-tauri/src/reason_acp/provider.rs).
// Pure: no Tauri, no React, so `chatModel.test.ts` covers it.

import { reasonEffort, reasonModelId } from "../diff/review.ts";
import { agentForModel, storedModel, type ModelAgent } from "../../settings/models.ts";
import type { Settings } from "../../settings/types.ts";
import type { ReasonConfig } from "./reasonChat.ts";

/**
 * Reason Session options for a Conductor (or Reason) model id and effort
 * level. A model Reason has no fixed id for (a Claude alias such as `opus`)
 * and an effort Reason does not offer are left out, so Reason's
 * default runs; Reason's own `default` (Auto) is kept, so a pick of Auto
 * reaches a Session that runs another model.
 */
export function sessionConfig(model: string | null | undefined, effort: string | null | undefined): ReasonConfig[] {
  const config: ReasonConfig[] = [];
  const trimmed = model?.trim();
  const id = !trimmed ? null : trimmed === "default" ? "default" : reasonModelId(trimmed);
  if (id) config.push({ id: "model", value: id });
  const level = reasonEffort(effort);
  if (level) config.push({ id: "reasoning_effort", value: level });
  return config;
}

/**
 * An agent's effort setting for new chats, as Conductor stores it:
 * `models.claude_code.default_effort_level` for Claude (Conductor's
 * `default_claude_effort_level`, evidence/settings/NOTES.md) and
 * `models.codex.default_thinking_level` for Codex. Null when unset.
 */
export function defaultEffortSetting(settings: Settings, agent: ModelAgent | null): string | null {
  const level = agent === "claude" ? settings.models.claude_code?.default_effort_level : agent === "codex" ? settings.models.codex.default_thinking_level : null;
  return level ?? null;
}

/**
 * Settings › Agents › Reason's model and effort for new Reason chats
 * (`[reason] model`, `reasoning_effort`); null when no model is set there,
 * so Settings › Default models applies.
 */
export function reasonDefault(settings: Settings): { model: string; effort: string | null } | null {
  const model = settings.reason?.model?.trim();
  return model ? { model, effort: settings.reason?.reasoning_effort ?? null } : null;
}

/** Options for a chat with no model picked: the default model with its agent's default effort. */
export function defaultChatConfig(settings: Settings): ReasonConfig[] {
  const pinned = reasonDefault(settings);
  if (pinned) return sessionConfig(pinned.model, pinned.effort);
  const model = storedModel(settings.models.default);
  return sessionConfig(model, defaultEffortSetting(settings, agentForModel(model)));
}
