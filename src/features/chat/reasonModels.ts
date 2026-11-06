// What a Reason chat's Session runs and offers, as Reason reports it over ACP
// (the backend's `models` event, src-tauri/src/reason_acp/provider.rs): its
// `model` config option's values with Reason's names ("Claude Opus 5.5",
// "Auto"), and the model it runs. A new Session's model is "default" (Auto)
// until its first turn; after each turn the backend names the model that
// turn actually ran on (`reason session get`).
//
// The composer's chip shows that model, and the picker lists Reason's models.
// Conductor does the same for its ACP agents: their models come from the
// agent's own `model` config option (sidecar `listAcpModels`), and a pick is
// set on the running session (`setAcpSessionConfigOption`).
//
// Kept per chat (so a reopened chat shows its last known model before its
// Session is resumed) and the last list seen is kept for chats with no
// Session yet.

import { conductorModelId } from "./chatModelChoice.ts";
import { isReasonModelId, modelDisplayName, type ModelChoice } from "./composerModels.ts";

/** Reason's "Auto": the Workspace's default model. */
export const AUTO_MODEL = "default";

export interface ReasonModelOption {
  /** Reason's model id, e.g. `byok:anthropic:claude-opus-5-5`, or `default`. */
  value: string;
  /** Reason's name, e.g. "Claude Opus 5.5" or "Auto". */
  name: string;
  /** E.g. "Claude · Subscription". */
  description?: string | null;
}

export interface SessionModels {
  /** The model the Session runs; `default` until Reason has picked one. */
  current: string;
  /** Its reasoning effort, when known (`default` means Reason's own). */
  effort: string | null;
  /** The models it offers, in Reason's order. */
  options: ReasonModelOption[];
}

/** The `models` event from the backend. */
export interface ReasonModelsPayload extends SessionModels {
  chatId: string;
  type: "models";
}

type Store = Pick<Storage, "getItem" | "setItem">;
const chatKey = (chatId: string) => `openconductor.reason.models.${chatId}`;
const OPTIONS_KEY = "openconductor.reason.modelOptions";

function parseOptions(v: unknown): ReasonModelOption[] {
  if (!Array.isArray(v)) return [];
  return v.filter((o): o is ReasonModelOption => typeof o?.value === "string" && typeof o?.name === "string");
}

function parseModels(raw: string | null): SessionModels | null {
  try {
    const v = raw === null ? null : JSON.parse(raw);
    if (!v || typeof v.current !== "string") return null;
    return { current: v.current, effort: typeof v.effort === "string" ? v.effort : null, options: parseOptions(v.options) };
  } catch {
    return null;
  }
}

/**
 * The name the composer shows for a Reason model id: Reason's own name when
 * the list has it, "Auto" for `default`, else Conductor's name for the same
 * model (`byok:anthropic:claude-opus-5-5` → "Opus 5.5"), else the id.
 */
export function reasonModelName(model: string, options: readonly ReasonModelOption[]): string {
  const named = options.find((o) => o.value === model)?.name;
  if (named) return named;
  if (model === AUTO_MODEL) return "Auto";
  return modelDisplayName(conductorModelId(model));
}

/** An effort Reason reported, or null for none or Reason's `default`. */
const knownEffort = (e: string | null | undefined): string | null => (e && e !== "default" ? e : null);

/**
 * What the composer's chip shows for a Reason chat: the model its Session
 * runs once Reason has named one, else the chat's pick (a Conductor id is
 * shown as the Reason model it runs as; one Reason has no id for, such as
 * the `opus` alias, runs as Auto).
 */
export function chipModel(picked: ModelChoice, session: SessionModels | null, toReasonId: (model: string) => string | null): ModelChoice {
  if (session && session.current !== AUTO_MODEL) return { model: session.current, effort: knownEffort(session.effort) ?? picked.effort };
  const model = isReasonModelId(picked.model) ? picked.model : (toReasonId(picked.model) ?? AUTO_MODEL);
  return { model, effort: picked.effort };
}

// The live store: one record per chat, the last list any Session offered,
// and listeners. Reads return the same objects until something is recorded
// (React's useSyncExternalStore compares snapshots by identity).
const byChat = new Map<string, SessionModels | null>();
let lastOptions: ReasonModelOption[] | undefined;
const listeners = new Set<() => void>();

function storage(): Store | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

/** Keeps what the backend reported for the chat's Session and tells listeners. */
export function recordModels(chatId: string, models: SessionModels, store: Store | null = storage()): void {
  const known = models.options.length ? models : { ...models, options: sessionModels(chatId, store)?.options ?? [] };
  byChat.set(chatId, known);
  if (models.options.length) lastOptions = models.options;
  try {
    store?.setItem(chatKey(chatId), JSON.stringify(known));
    if (models.options.length) store?.setItem(OPTIONS_KEY, JSON.stringify(models.options));
  } catch (e) {
    console.warn("reason: models not saved", e);
  }
  for (const fn of listeners) fn();
}

/** The chat's Session models as last reported (this run or an earlier one), or null. */
export function sessionModels(chatId: string, store: Store | null = storage()): SessionModels | null {
  if (!byChat.has(chatId)) byChat.set(chatId, parseModels(store?.getItem(chatKey(chatId)) ?? null));
  return byChat.get(chatId) ?? null;
}

/** The models the chat's Session offers, else the last list any Reason Session offered. */
export function modelOptions(chatId: string, store: Store | null = storage()): ReasonModelOption[] {
  const own = sessionModels(chatId, store)?.options ?? [];
  if (own.length) return own;
  if (lastOptions === undefined) {
    try {
      lastOptions = parseOptions(JSON.parse(store?.getItem(OPTIONS_KEY) ?? "null"));
    } catch {
      lastOptions = [];
    }
  }
  return lastOptions;
}

export function subscribeModels(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Forgets the in-memory records (tests). */
export function resetModelsForTest(): void {
  byChat.clear();
  lastOptions = undefined;
}
