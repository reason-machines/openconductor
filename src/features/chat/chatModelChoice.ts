// The model and effort a workspace chat's composer shows and picks. Conductor
// keeps them on the chat's session (model, thinking level, fast mode); here
// they are kept per chat in localStorage and become the Reason Session's
// options (`configureReason`, applied to the open Session before its next
// prompt, or when the chat opens one).
// A chat with nothing picked shows what it runs: the options the New
// workspace dialog gave it (read back from reasonChat's saved config), else
// Settings › Default models.

import { MODEL_CATALOG, agentForModel } from "../../settings/models.ts";
import type { Settings } from "../../settings/types.ts";
import { defaultEffortSetting, reasonDefault } from "./chatModel.ts";
import { fastModeAvailable, type ModelChoice } from "./composerModels.ts";
import type { ReasonConfig } from "./reasonChat.ts";
import type { LoadoutSlot } from "../../settings/agents/loadout.ts";
import { loadoutChoices } from "./loadoutChoices.ts";
import { saveAgent, type ChatAgentId } from "./agentChoice.ts";
import { agentForPick, CLAUDE_ENTRY, CODEX_ENTRY } from "./chatAgentChoice.ts";

type Store = Pick<Storage, "getItem" | "setItem">;
const choiceKey = (chatId: string) => `openconductor.composer.model.${chatId}`;
/** reasonChat.ts keeps a chat's picked Session options under this key. */
const reasonConfigKey = (chatId: string) => `openconductor.reason.config.${chatId}`;

export function saveModelChoice(chatId: string, choice: ModelChoice, store: Store = localStorage): void {
  try {
    store.setItem(choiceKey(chatId), JSON.stringify(choice));
  } catch (e) {
    console.warn("composer: model choice not saved", e);
  }
}

function parse(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The Conductor model id for a Reason model id (`byok:anthropic:claude-opus-5-5` → `opus-5-5-1m`). */
export function conductorModelId(reasonModel: string): string {
  const claude = /^byok:anthropic:claude-(.+)$/.exec(reasonModel)?.[1];
  if (claude) return MODEL_CATALOG.claude.includes(claude) ? claude : MODEL_CATALOG.claude.includes(`${claude}-1m`) ? `${claude}-1m` : reasonModel;
  const codex = /^byok:openai-codex:(.+)$/.exec(reasonModel)?.[1];
  if (codex) return codex;
  return reasonModel;
}

/** The choice a saved Reason config describes, if it names a model. */
export function choiceFromReasonConfig(config: readonly ReasonConfig[]): ModelChoice | null {
  const model = config.find((c) => c.id === "model")?.value;
  if (!model) return null;
  const effort = config.find((c) => c.id === "reasoning_effort")?.value ?? null;
  return { model: conductorModelId(model), effort };
}

/** The chat's picked choice, else the one its saved Reason options name; null when neither exists. */
export function loadModelChoice(chatId: string, store: Store = localStorage): ModelChoice | null {
  const v = parse(store.getItem(choiceKey(chatId)));
  if (v && typeof v === "object" && typeof (v as ModelChoice).model === "string") {
    const c = v as ModelChoice;
    return { model: c.model, effort: typeof c.effort === "string" ? c.effort : null, ...(c.agent === "claude" || c.agent === "codex" || c.agent === "reason" ? { agent: c.agent } : {}), ...(c.fast ? { fast: true } : {}) };
  }
  const config = parse(store.getItem(reasonConfigKey(chatId)));
  return Array.isArray(config) ? choiceFromReasonConfig(config as ReasonConfig[]) : null;
}

/** Initialize only a new chat: an empty first slot never promotes a later favorite. */
export function initializeLoadoutChoice(chatId: string, slots: readonly LoadoutSlot[], store: Store = localStorage): ModelChoice {
  const saved = loadModelChoice(chatId, store);
  if (saved) return saved;
  const first: ModelChoice = loadoutChoices(slots)[0] ?? { agent: "reason", model: "default", effort: null };
  saveModelChoice(chatId, first, store);
  saveAgent(chatId, first.agent ?? "reason", store);
  return first;
}

export function copyModelChoice(sourceId: string, targetId: string, agent: ChatAgentId, config: readonly ReasonConfig[], store: Store = localStorage): void {
  const choice = loadModelChoice(sourceId, store) ?? choiceFromReasonConfig(config) ?? (agent === "codex" ? CODEX_ENTRY : agent === "claude" ? CLAUDE_ENTRY : { agent: "reason" as const, model: "default", effort: null });
  saveModelChoice(targetId, agentForPick(choice) === agent ? choice : { ...choice, agent }, store);
  saveAgent(targetId, agent, store);
}

export function localModelOptions(chatId: string, agent: "claude" | "codex", store: Store = localStorage): { model?: string; effort?: string; fastMode?: boolean } {
  const choice = loadModelChoice(chatId, store);
  if (choice?.agent !== agent) return {};
  return { model: choice.model, ...(choice.effort ? { effort: choice.effort } : {}), ...(fastModeAvailable(choice.model) ? { fastMode: choice.fast === true } : {}) };
}

/** Settings › Agents › Reason's default model, else Settings › Default models: the default model and its agent's default effort. */
export function defaultModelChoice(settings: Settings): ModelChoice {
  const pinned = reasonDefault(settings);
  if (pinned) return pinned;
  const model = settings.models.default;
  return { model, effort: defaultEffortSetting(settings, agentForModel(model)) };
}
