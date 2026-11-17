// A session's latest context sample is not its cumulative turn-cost usage.
// Retained Conductor Doe/oct/ITo: cache-inclusive top-level sample, compact
// reset, model-specific denominator, then one-decimal display threshold.
export interface ContextUsage {
  model?: string;
  totalTokens?: number;
  inputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  outputTokens?: number;
  contextWindow?: number;
}

export type ContextUpdate =
  | ({ kind: "sample" } & ContextUsage)
  | { kind: "window"; model: string; contextWindow: number }
  | { kind: "reset" };

export interface ContextState {
  sample?: ContextUsage;
  windows: Record<string, number>;
}

export const emptyContext = (): ContextState => ({ windows: {} });
export const contextStorageKey = (chatId: string): string => `openconductor.chat-context.v1.${chatId}`;
const countKeys = ["inputTokens", "cacheReadInputTokens", "cacheCreationInputTokens", "outputTokens"] as const;
const natural = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const modelId = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 512;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** The wire and saved state are untrusted; reject malformed counts, not coerce. */
export function contextUpdate(value: unknown): ContextUpdate | undefined {
  if (!object(value)) return;
  if (value.kind === "reset") return { kind: "reset" };
  if (value.kind === "window") {
    if (modelId(value.model) && natural(value.contextWindow) && value.contextWindow > 0) {
      return { kind: "window", model: value.model, contextWindow: value.contextWindow };
    }
    return;
  }
  if (value.kind !== "sample") return;
  const sample: ContextUsage = {};
  if (value.model !== undefined) {
    if (!modelId(value.model)) return;
    sample.model = value.model;
  }
  for (const key of [...countKeys, "totalTokens", "contextWindow"] as const) {
    if (value[key] === undefined) continue;
    if (!natural(value[key]) || (key === "contextWindow" && value[key] === 0)) return;
    sample[key] = value[key];
  }
  if (sample.totalTokens === undefined) {
    const total = countKeys.reduce((sum, key) => sum + (sample[key] ?? 0), 0);
    // Claude's empty assistant usage is not a compact boundary or a reset.
    if (!Number.isSafeInteger(total) || total === 0) return;
    sample.totalTokens = total;
  }
  return { kind: "sample", ...sample };
}

function withWindow(windows: Record<string, number>, model: string, size: number): Record<string, number> {
  // Bound the cache while retaining the newest model entry; computed property
  // keys and own-property lookup also keep names such as __proto__ inert.
  return Object.fromEntries([...Object.entries(windows).filter(([key]) => key !== model), [model, size]].slice(-128));
}

export function applyContextUpdate(state: ContextState, value: unknown): ContextState {
  const update = contextUpdate(value);
  if (!update) return state;
  if (update.kind === "window") return { ...state, windows: withWindow(state.windows, update.model, update.contextWindow) };
  if (update.kind === "reset") {
    return { windows: state.windows, sample: { ...(state.sample?.model ? { model: state.sample.model } : {}), totalTokens: 0 } };
  }
  const { kind: _kind, ...sample } = update;
  const windows = sample.model && sample.contextWindow
    ? withWindow(state.windows, sample.model, sample.contextWindow)
    : state.windows;
  return { sample, windows };
}

export function currentContextUsage(state: ContextState): ContextUsage | undefined {
  const sample = state.sample;
  if (!sample) return;
  const cached = sample.model && Object.hasOwn(state.windows, sample.model) ? state.windows[sample.model] : undefined;
  return { ...sample, ...(sample.contextWindow ?? cached ? { contextWindow: sample.contextWindow ?? cached } : {}) };
}

export function restoreContext(saved: string | null): ContextState {
  if (!saved) return emptyContext();
  try {
    const value: unknown = JSON.parse(saved);
    if (!object(value) || value.version !== 1) return emptyContext();
    let state = emptyContext();
    if (object(value.windows)) {
      for (const [model, contextWindow] of Object.entries(value.windows).slice(-128)) {
        state = applyContextUpdate(state, { kind: "window", model, contextWindow });
      }
    }
    if (object(value.sample)) state = applyContextUpdate(state, { ...value.sample, kind: "sample" });
    return state;
  } catch { return emptyContext(); }
}

export const storeContext = (state: ContextState): string => JSON.stringify({ version: 1, ...state });
