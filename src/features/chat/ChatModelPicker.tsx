// The workspace chat's model picker. The chip shows the model the chat's
// Reason Session ran its last turn on (Reason reports it after each turn,
// reasonModels.ts); before a turn ran, the chat's model and effort (picked,
// from the New workspace dialog, or Settings › Default models) as Reason runs
// them, which is "Auto" for a model Reason has no fixed id for. The list has
// every model Reason offers, by Reason's names, and "Add models" / "Edit"
// open Settings › Default models. A pick becomes the chat's Reason Session
// options (model, reasoning_effort); a Session already open switches before
// its next prompt, as Conductor's does.
//
// It also picks the chat's agent, as Conductor's picker does (the model decides
// the agent): when the CLI agents can run here they are listed as "Codex" and
// "Claude Code" after the models (chatAgentChoice.ts), and such a chat shows its
// agent's name on the chip.

import { useEffect, useState } from "react";
import { getSettings } from "../../settings/api";
import { pickReasonModel, reasonModels, RUNNING_MODEL_EVENT } from "./reasonChat.ts";
import { sessionConfig } from "./chatModel.ts";
import { AUTO, loadCachedModels, loadRunningModel, modelEntries, reasonChoice, reasonModelName, shownModel, type ReasonModelOption, type RunningModel } from "./reasonModels.ts";
import { defaultModelChoice, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import { agentEntryLabel, agentForPick, pickerState } from "./chatAgentChoice.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import type { ModelChoice } from "./composerModels.ts";
import { ModelPicker } from "./ModelPicker.tsx";

/** Asks the app shell to open a settings page (App.tsx listens). */
export const OPEN_SETTINGS_EVENT = "openconductor:open-settings";
export function openSettingsPage(page: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page } }));
}
/** Opens Settings › Agents on `agent`'s tab (`?providerTab=`). */
export function openAgentSettings(agent: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page: "providers", providerTab: agent } }));
}
/** Asks the app shell to open a repository's settings section (for example "scripts"). */
export function openRepoSettingsPage(repoId: string, section: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { repoId, section } }));
}

export interface ChatModelPickerProps {
  chatId: string;
  disabled?: boolean;
  /** The chat's agent; defaults to Reason. */
  agent?: ChatAgentId;
  /** Set when the chat can switch agents (the CLIs run here): picking Codex, Claude Code or a model calls it. */
  onAgentChange?: (next: ChatAgentId) => void;
}

export function ChatModelPicker({ chatId, disabled = false, agent = "reason", onAgentChange }: ChatModelPickerProps) {
  const [choice, setChoice] = useState<ModelChoice | null>(() => loadModelChoice(chatId));
  const [fallback, setFallback] = useState<ModelChoice | null>(null);
  const [running, setRunning] = useState<RunningModel | null>(() => loadRunningModel(chatId));
  const [models, setModels] = useState<ReasonModelOption[]>(() => loadCachedModels());

  useEffect(() => {
    let live = true;
    void reasonModels().then((m) => live && m.length > 0 && setModels(m));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    setRunning(loadRunningModel(chatId));
    const onRunning = (e: Event) => {
      const d = (e as CustomEvent<{ chatId: string; running: RunningModel | null }>).detail;
      if (d.chatId === chatId) setRunning(d.running);
    };
    window.addEventListener(RUNNING_MODEL_EVENT, onRunning);
    return () => window.removeEventListener(RUNNING_MODEL_EVENT, onRunning);
  }, [chatId]);

  useEffect(() => {
    let live = true;
    setChoice(loadModelChoice(chatId));
    getSettings().then(
      (s) => live && setFallback(defaultModelChoice(s)),
      () => live && setFallback({ model: "opus-5-1m", effort: "high" }),
    );
    return () => {
      live = false;
    };
  }, [chatId]);

  const picked = choice ?? fallback;
  if (!picked) return null;
  const pickedAuto = reasonChoice(picked).model === AUTO;
  const state = pickerState(agent, shownModel(running, picked, models), fallback && reasonChoice(fallback), !!onAgentChange);
  return (
    <ModelPicker
      value={state.value}
      label={state.label}
      favorites={state.favorites}
      models={modelEntries(models)}
      modelName={(m) => reasonModelName(m, models)}
      modelDescription={(m) => models.find((o) => o.value === m)?.description}
      itemLabel={agentEntryLabel}
      itemAgent={agentForPick}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => {
        const nextAgent = agentForPick(next);
        if (nextAgent !== agent) onAgentChange?.(nextAgent);
        if (nextAgent !== "reason") return;
        // A new effort for the model Auto ran keeps the chat on Auto.
        const pick = pickedAuto && running && next.model === running.model ? { ...next, model: AUTO } : next;
        setChoice(pick);
        setRunning(null);
        saveModelChoice(chatId, pick);
        pickReasonModel(chatId, sessionConfig(pick.model, pick.effort));
      }}
    />
  );
}
