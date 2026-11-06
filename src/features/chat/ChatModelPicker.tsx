// The workspace chat's model picker: the chat's model and effort (picked,
// from the New workspace dialog, or Settings › Default models), a list with
// that model and the default one, and "Add models" / "Edit" opening
// Settings › Default models. A pick becomes the chat's Reason Session options
// (model, reasoning_effort) for the next Session it opens.
//
// It also picks the chat's agent, as Conductor's picker does (the model decides
// the agent): when Codex can run here it is listed as "Codex" after the models
// (chatAgentChoice.ts), and a Codex chat shows "Codex" on the chip.

import { useEffect, useState } from "react";
import { getSettings } from "../../settings/api";
import { configureReason } from "./reasonChat.ts";
import { sessionConfig } from "./chatModel.ts";
import { defaultModelChoice, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import { agentEntryLabel, agentForPick, pickerState, type ChatAgent } from "./chatAgentChoice.ts";
import type { ModelChoice } from "./composerModels.ts";
import { ModelPicker } from "./ModelPicker.tsx";

/** Asks the app shell to open a settings page (App.tsx listens). */
export const OPEN_SETTINGS_EVENT = "openconductor:open-settings";
export function openSettingsPage(page: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page } }));
}

export interface ChatModelPickerProps {
  chatId: string;
  disabled?: boolean;
  /** The chat's agent; defaults to Reason. */
  agent?: ChatAgent;
  /** Set when the chat can switch agents (Codex runs here): picking Codex or a model calls it. */
  onAgentChange?: (next: ChatAgent) => void;
}

export function ChatModelPicker({ chatId, disabled = false, agent = "reason", onAgentChange }: ChatModelPickerProps) {
  const [choice, setChoice] = useState<ModelChoice | null>(() => loadModelChoice(chatId));
  const [fallback, setFallback] = useState<ModelChoice | null>(null);

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

  const reasonModel = choice ?? fallback;
  if (!reasonModel) return null;
  const state = pickerState(agent, reasonModel, fallback, !!onAgentChange);
  return (
    <ModelPicker
      value={state.value}
      label={state.label}
      favorites={state.favorites}
      itemLabel={agentEntryLabel}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => {
        const nextAgent = agentForPick(next);
        if (nextAgent !== agent) onAgentChange?.(nextAgent);
        if (nextAgent !== "reason") return;
        setChoice(next);
        saveModelChoice(chatId, next);
        configureReason(chatId, sessionConfig(next.model, next.effort));
      }}
    />
  );
}
