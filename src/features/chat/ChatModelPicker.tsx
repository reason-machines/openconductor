// The workspace chat's model picker: the chat's model and effort (picked,
// from the New workspace dialog, or Settings › Default models), a list with
// that model and the default one, and "Add models" / "Edit" opening
// Settings › Default models. A pick becomes the chat's Reason Session options
// (model, reasoning_effort); a Session already open switches before its next
// prompt, as Conductor's does.

import { useEffect, useState } from "react";
import { getSettings } from "../../settings/api";
import { configureReason } from "./reasonChat.ts";
import { sessionConfig } from "./chatModel.ts";
import { defaultModelChoice, loadModelChoice, saveModelChoice } from "./chatModelChoice.ts";
import type { ModelChoice } from "./composerModels.ts";
import { ModelPicker } from "./ModelPicker.tsx";

/** Asks the app shell to open a settings page (App.tsx listens). */
export const OPEN_SETTINGS_EVENT = "openconductor:open-settings";
export function openSettingsPage(page: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page } }));
}

export function ChatModelPicker({ chatId, disabled = false }: { chatId: string; disabled?: boolean }) {
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

  const value = choice ?? fallback;
  if (!value) return null;
  return (
    <ModelPicker
      value={value}
      favorites={fallback ? [fallback] : []}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => {
        setChoice(next);
        saveModelChoice(chatId, next);
        configureReason(chatId, sessionConfig(next.model, next.effort));
      }}
    />
  );
}
