// Session options (model, reasoning effort) for a workspace's own chat.
// Conductor starts a workspace's chat on the model and effort picked in the
// New workspace dialog, else on Settings › Default models' "Default model"
// ("Model for new chats", evidence/settings/NOTES.md). Reason takes them as
// Session config options (`model`, `reasoning_effort`) set right after
// `session/new` (src-tauri/src/reason_acp/provider.rs).
// Pure: no Tauri, no React, so `chatModel.test.ts` covers it.

import { reasonEffort, reasonModelId } from "../diff/review.ts";
import { agentForModel } from "../../settings/models.ts";
import type { Settings } from "../../settings/types.ts";
import type { ReasonConfig } from "./reasonChat.ts";

/**
 * Reason Session options for a Conductor model id and effort level. A model
 * Reason has no fixed id for (a Claude alias such as `opus`, Cursor) and an
 * effort Reason does not offer are left out, so Reason's default runs.
 */
export function sessionConfig(model: string | null | undefined, effort: string | null | undefined): ReasonConfig[] {
  const config: ReasonConfig[] = [];
  const id = model?.trim() ? reasonModelId(model.trim()) : null;
  if (id) config.push({ id: "model", value: id });
  const level = reasonEffort(effort);
  if (level) config.push({ id: "reasoning_effort", value: level });
  return config;
}

/**
 * Options for a chat with no model picked: the default model, with Codex's
 * `default_thinking_level` when it is a Codex model. Claude has no default
 * effort level in Conductor's settings (only `default_thinking_enabled`).
 */
export function defaultChatConfig(settings: Settings): ReasonConfig[] {
  const model = settings.models.default;
  const effort = agentForModel(model) === "codex" ? settings.models.codex.default_thinking_level : null;
  return sessionConfig(model, effort);
}
