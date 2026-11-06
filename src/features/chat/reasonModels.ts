// What a Reason chat's model picker shows: the model the chat's Session
// actually runs, and the models Reason offers.
//
// Reason's ACP agent offers its models as the `model` option of a new
// Session (`reason_models`, e.g. "Auto" for `default`, "Claude Opus 5.5" for
// `byok:anthropic:claude-opus-5-5`). With `default` Reason picks a model per
// turn, and its ACP stream names none, so after each turn the backend asks
// `reason session get` and sends a `sessionModel` event with the model and
// effort the Session ran on. That is what the chip shows once a turn ran;
// before, it shows what the next Session will run: the picked or default
// model as Reason runs it (a Claude alias such as `opus` has no fixed Reason
// model and runs Auto).
// Pure: no React, no Tauri, so reasonModels.test.ts covers it.

import { reasonEffort, reasonModelId } from "../diff/review.ts";
import { modelLabel } from "../../settings/models.ts";
import type { ModelChoice } from "./composerModels.ts";

/** One model Reason offers. */
export interface ReasonModelOption {
  /** Reason model id; `default` is Auto. */
  value: string;
  /** Reason's name, e.g. "Claude Opus 5.5". */
  name: string;
  /** e.g. "Claude · Subscription". */
  description?: string;
}

/** The model and effort a chat's Session ran its last turn on. */
export interface RunningModel {
  model: string;
  effort: string | null;
}

/** Reason's model option value for "Auto": the Workspace's default, picked per turn. */
export const AUTO = "default";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const runningKey = (chatId: string) => `openconductor.reason.running.${chatId}`;
const MODELS_KEY = "openconductor.reason.models";

/** The Reason model id a model runs as: Conductor ids map to Reason's; one Reason has no fixed model for runs Auto. */
export function reasonModelFor(model: string): string {
  return model === AUTO ? AUTO : (reasonModelId(model) ?? AUTO);
}

/** A choice in Reason's terms: its Reason model id and a reasoning effort Reason offers (else none). */
export function reasonChoice(choice: ModelChoice): ModelChoice {
  return { model: reasonModelFor(choice.model), effort: reasonEffort(choice.effort) };
}

/** Reason's name for a model id, else one made from the id ("Claude Opus 5.5", "GPT-5.6 Sol"). */
export function reasonModelName(model: string, options: readonly ReasonModelOption[]): string {
  const offered = options.find((o) => o.value === model);
  if (offered) return offered.name;
  if (model === AUTO) return "Auto";
  const claude = /^byok:anthropic:claude-(.+)$/.exec(model)?.[1];
  if (claude) return `Claude ${modelLabel(claude)}`;
  const id = model.split(/[:/]/).at(-1) ?? model;
  return id.startsWith("gpt-") ? modelLabel(id) : id;
}

/**
 * The picker's current entry: the model the Session ran its last turn on
 * when there is one, else the picked choice (or the default) as Reason runs it.
 */
export function shownModel(running: RunningModel | null, picked: ModelChoice): ModelChoice {
  return running ? { model: running.model, effort: running.effort } : reasonChoice(picked);
}

/** Each offered model as a picker entry, Auto first as Reason lists it. */
export function modelEntries(options: readonly ReasonModelOption[]): ModelChoice[] {
  return options.map((o) => ({ model: o.value, effort: null }));
}

function parse(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadRunningModel(chatId: string, store: Store = localStorage): RunningModel | null {
  const v = parse(store.getItem(runningKey(chatId))) as Partial<RunningModel> | null;
  if (!v || typeof v.model !== "string" || !v.model) return null;
  return { model: v.model, effort: typeof v.effort === "string" ? v.effort : null };
}

/** Saves what the chat's Session ran on; null forgets it (a new Session, or a new pick). */
export function saveRunningModel(chatId: string, running: RunningModel | null, store: Store = localStorage): void {
  try {
    if (running) store.setItem(runningKey(chatId), JSON.stringify(running));
    else store.removeItem(runningKey(chatId));
  } catch (e) {
    console.warn("reason: running model not saved", e);
  }
}

/** Parses `reason_models`' `options` (or a cached copy); drops malformed entries. */
export function parseModelOptions(v: unknown): ReasonModelOption[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is ReasonModelOption => typeof o?.value === "string" && typeof o?.name === "string")
    .map((o) => ({ value: o.value, name: o.name, ...(typeof o.description === "string" ? { description: o.description } : {}) }));
}

/** The last model list Reason gave, so the picker lists it before Reason answers again. */
export function loadCachedModels(store: Store = localStorage): ReasonModelOption[] {
  return parseModelOptions(parse(store.getItem(MODELS_KEY)));
}

export function saveCachedModels(options: readonly ReasonModelOption[], store: Store = localStorage): void {
  try {
    store.setItem(MODELS_KEY, JSON.stringify(options));
  } catch (e) {
    console.warn("reason: model list not cached", e);
  }
}
