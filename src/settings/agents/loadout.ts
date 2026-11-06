// The Default models "Loadout" (Conductor 0.87.6 renderApp `M3a`, `nUi`,
// `i3a`, `n3a`, `Z2a`): up to five favorite models, the first of which is
// the default model for new chats. Stored like Conductor in conductor.db
// `favorite_models`, one row per slot with the configuration as JSON
// (`$9t`: `{type:"built-in", agent, model, thinkingLevel, fastMode}` or
// `{type:"acp", acpAgentId, modelId}`). Pure, so node --test covers it.
import { agentForModel, AGENT_DEFAULT_MODEL, storedModel, type ModelAgent } from "../models.ts";
import { CLAUDE_EFFORT_LEVELS, type ClaudeEffortLevel, type Settings, type ThinkingLevel } from "../types.ts";
import type { FavoriteRow } from "./api.ts";

/** Conductor's `J6t`: the number of loadout slots. */
export const LOADOUT_SLOTS = 5;

export interface BuiltInFavorite {
  id: string;
  type: "built-in";
  agent: ModelAgent;
  model: string;
  thinkingLevel?: string;
  fastMode: boolean;
}
export interface AcpFavorite {
  id: string;
  type: "acp";
  acpAgentId: string;
  modelId: string;
}
export type Favorite = BuiltInFavorite | AcpFavorite;

/** Conductor's built-in default effort per agent (`Uv.<agent>.defaultLevel`). */
export const DEFAULT_EFFORT: Record<ModelAgent, string | undefined> = { claude: "high", codex: "medium" };

/** Effort levels each agent's models offer (index `Wv`, `Bv`, `zp`). */
export const EFFORT_LEVELS: Record<ModelAgent, readonly string[]> = {
  claude: CLAUDE_EFFORT_LEVELS,
  codex: ["none", "low", "medium", "high", "xhigh", "max", "ultra"],
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Stored rows to favorites; rows Conductor would not parse are dropped. */
export function parseFavorites(rows: readonly FavoriteRow[]): Favorite[] {
  const out: Favorite[] = [];
  for (const row of rows) {
    let c: unknown;
    try {
      c = JSON.parse(row.configuration);
    } catch {
      continue;
    }
    if (!isObj(c)) continue;
    if (c.type === "acp" && typeof c.acpAgentId === "string" && typeof c.modelId === "string") {
      out.push({ id: row.id, type: "acp", acpAgentId: c.acpAgentId, modelId: c.modelId });
    } else if (c.type === "built-in" && typeof c.model === "string") {
      const agent = agentForModel(c.model);
      if (!agent) continue;
      out.push({
        id: row.id,
        type: "built-in",
        agent,
        model: c.model,
        ...(typeof c.thinkingLevel === "string" ? { thinkingLevel: c.thinkingLevel } : {}),
        fastMode: c.fastMode === true,
      });
    }
  }
  return out;
}

export function toRows(favorites: readonly Favorite[]): FavoriteRow[] {
  return favorites.map(({ id, ...rest }) => ({ id, configuration: JSON.stringify(rest) }));
}

/** The effort the settings give `model` for new chats (or reviews). */
export function settingsEffort(settings: Settings, model: string, purpose: "default" | "review" = "default"): string | undefined {
  const agent = agentForModel(model) ?? "claude";
  if (agent === "claude") {
    const c = settings.models.claude_code;
    const level = purpose === "review" ? (c?.review_effort_level ?? c?.default_effort_level) : c?.default_effort_level;
    return level ?? DEFAULT_EFFORT.claude;
  }
  if (agent === "codex") return purpose === "review" ? settings.models.codex.review_thinking_level : settings.models.codex.default_thinking_level;
  return undefined;
}

export function builtIn(id: string, model: string, thinkingLevel?: string, fastMode = false): BuiltInFavorite {
  const agent = agentForModel(model) ?? "claude";
  const level = thinkingLevel ?? DEFAULT_EFFORT[agent];
  return { id, type: "built-in", agent, model, ...(level ? { thinkingLevel: level } : {}), fastMode };
}

/** Slot 1 as the settings describe it: the default model (a removed Cursor id reads as the default) with its effort and fast mode. */
export function defaultFavorite(settings: Settings, id = "default"): BuiltInFavorite {
  const model = storedModel(settings.models.default || AGENT_DEFAULT_MODEL.claude);
  return builtIn(id, model, settingsEffort(settings, model), settings.models.default_fast_mode === true);
}

/**
 * What the slots show (Conductor's `nUi`): with nothing stored, the default
 * model alone; otherwise the stored list with slot 1 replaced by the default
 * model from the settings.
 */
export function displayedLoadout(settings: Settings, stored: readonly Favorite[]): Favorite[] {
  if (stored.length === 0) return [defaultFavorite(settings)];
  return stored.map((f, i) => (i === 0 ? defaultFavorite(settings, f.id) : f));
}

/** Puts `fav` in slot `index`: replaces an occupied slot, appends at the next free one. */
export function equip(list: readonly Favorite[], fav: Favorite, index: number): Favorite[] {
  const i = Math.max(0, Math.min(index, list.length, LOADOUT_SLOTS - 1));
  if (i < list.length) return list.map((f, j) => (j === i ? { ...fav, id: f.id } : f));
  return [...list, fav];
}

/** Conductor's `Iei`: moves the entry at `from` to `to`. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** Removes a slot; the last remaining slot stays (Conductor's `gt`). */
export function remove(list: readonly Favorite[], id: string): Favorite[] {
  return list.length <= 1 ? [...list] : list.filter((f) => f.id !== id);
}

/** Whether a palette model is already in the loadout (the check mark, `L3a`). */
export const isEquipped = (list: readonly Favorite[], model: string) => list.some((f) => f.type === "built-in" && f.model === model);

/** Settings with slot 1's model, effort and fast mode as the default for new chats. */
export function withDefault(settings: Settings, fav: Favorite): Settings {
  if (fav.type !== "built-in") return settings;
  const m = settings.models;
  const next: Settings = { ...settings, models: { ...m, default: fav.model, default_fast_mode: fav.fastMode } };
  if (fav.agent === "claude" && fav.thinkingLevel)
    next.models.claude_code = { ...m.claude_code, default_effort_level: fav.thinkingLevel as ClaudeEffortLevel };
  if (fav.agent === "codex" && fav.thinkingLevel) next.models.codex = { ...m.codex, default_thinking_level: fav.thinkingLevel as ThinkingLevel };
  return next;
}

/** Settings with the review model set to `fav` (Conductor's `F3a` onChange). */
export function withReview(settings: Settings, fav: BuiltInFavorite): Settings {
  const m = settings.models;
  const next: Settings = { ...settings, models: { ...m, review: fav.model, review_fast_mode: fav.fastMode } };
  if (fav.agent === "claude" && fav.thinkingLevel)
    next.models.claude_code = { ...m.claude_code, review_effort_level: fav.thinkingLevel as ClaudeEffortLevel };
  if (fav.agent === "codex" && fav.thinkingLevel) next.models.codex = { ...m.codex, review_thinking_level: fav.thinkingLevel as ThinkingLevel };
  return next;
}
