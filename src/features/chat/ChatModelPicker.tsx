// The workspace chat's model picker. For a Reason chat the chip shows the
// model its Session runs, as Reason reports it (reasonModels.ts): "Auto"
// until Reason picks one, then e.g. "Claude Opus 5.5"; before the chat has a
// Session, the chat's pick (New workspace dialog, Settings › Default models,
// or this picker) as the Reason model it runs as. The list is Reason's own
// models (the Session's `model` config option), searchable; until a Reason
// Session has reported them it falls back to the picked and default models.
// "Add models" / "Edit" open Settings › Default models. A pick becomes the
// chat's Reason Session options (model, reasoning_effort); an open Session
// switches before its next prompt, as Conductor's does.
//
// It also picks the chat's agent, as Conductor's picker does (the model decides
// the agent): when the CLI agents can run here they are listed as "Codex" and
// "Claude Code" after the models (chatAgentChoice.ts), and such a chat shows its
// agent's name on the chip.

import { useEffect, useState, useSyncExternalStore } from "react";
import { getSettings } from "../../settings/api";
import { configureReason } from "./reasonChat.ts";
import { sessionConfig } from "./chatModel.ts";
import { defaultModelChoice, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import { agentEntryLabel, agentForPick, pickerState } from "./chatAgentChoice.ts";
import type { ChatAgentId } from "./agentChoice.ts";
import type { ModelChoice } from "./composerModels.ts";
import { ModelPicker } from "./ModelPicker.tsx";
import { reasonModelId } from "../diff/review.ts";
import { chipModel, modelOptions, reasonModelName, recordModels, sessionModels, subscribeModels } from "./reasonModels.ts";

/** Asks the app shell to open a settings page (App.tsx listens). */
export const OPEN_SETTINGS_EVENT = "openconductor:open-settings";
export function openSettingsPage(page: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page } }));
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

/** A Conductor id as the Reason model it runs as; null for one Reason has no id for (the `opus` alias). */
const toReasonId = (model: string) => reasonModelId(model);

export function ChatModelPicker({ chatId, disabled = false, agent = "reason", onAgentChange }: ChatModelPickerProps) {
  const [choice, setChoice] = useState<ModelChoice | null>(() => loadModelChoice(chatId));
  const [fallback, setFallback] = useState<ModelChoice | null>(null);
  const session = useSyncExternalStore(subscribeModels, () => sessionModels(chatId));
  const options = useSyncExternalStore(subscribeModels, () => modelOptions(chatId), () => []);

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
  // What the chat runs, as a Reason model id: its Session's model, else its pick.
  const running = chipModel(picked, session, toReasonId);
  const reasonList: ModelChoice[] = options.length
    ? options.map((o) => ({ model: o.value, effort: null }))
    : [picked, ...(fallback ? [fallback] : [])].map((c) => ({ model: chipModel(c, null, toReasonId).model, effort: null }));
  const state = pickerState(agent, running, null, !!onAgentChange);
  const favorites = [...reasonList, ...state.favorites.filter((f) => agentEntryLabel(f))];
  return (
    <ModelPicker
      value={state.value}
      label={state.label}
      favorites={favorites}
      itemLabel={(c) => agentEntryLabel(c) ?? reasonModelName(c.model, options)}
      itemDetail={(c) => options.find((o) => o.value === c.model)?.description}
      maxItems={options.length ? Infinity : 5}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => {
        const nextAgent = agentForPick(next);
        if (nextAgent !== agent) onAgentChange?.(nextAgent);
        if (nextAgent !== "reason") return;
        // A model row carries no effort: keep the chat's.
        const pick = { ...next, effort: next.effort ?? running.effort };
        setChoice(pick);
        saveModelChoice(chatId, pick);
        // Shown at once; the open Session takes it before its next prompt, and Reason's report then
        // replaces this (a model it does not offer comes back as a notice and the model it kept).
        if (session) recordModels(chatId, { ...session, current: pick.model, effort: pick.effort });
        configureReason(chatId, sessionConfig(pick.model, pick.effort));
      }}
    />
  );
}
