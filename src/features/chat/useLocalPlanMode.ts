import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

export interface PlanModeControl {
  isPlanMode: boolean;
  disabled: boolean;
  onToggle(): void;
}

type Mode = "default" | "plan";
function parseMode(value: unknown): Mode {
  if (value === "default" || value === "plan") return value;
  throw new Error("The local chat returned an invalid Plan mode.");
}

export function useLocalPlanMode(chatId: string, workspaceId: string, enabled: boolean, busy: boolean, onError: (message: string) => void): PlanModeControl | undefined {
  const [saved, setSaved] = useState<{ chatId: string; mode: Mode; saving: boolean }>();
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    const request = ++generation.current;
    pending.current = false;
    setSaved(undefined);
    if (!enabled) return;
    let live = true;
    let eventSeen = false;
    const current = () => live && generation.current === request;
    void invoke<unknown>("local_plan_mode_get", { chatId, workspaceId }).then((value) => {
      const mode = parseMode(value);
      if (current() && !eventSeen) setSaved({ chatId, mode, saving: false });
    }).catch((error: unknown) => { if (current()) onError(String(error)); });
    const listening = listen<{ chatId: string; mode: unknown }>("local-plan-mode-changed", ({ payload }) => {
      if (current() && payload.chatId === chatId) {
        eventSeen = true;
        try { setSaved({ chatId, mode: parseMode(payload.mode), saving: false }); }
        catch (error) { onError(String(error)); }
      }
    });
    void listening.catch((error: unknown) => { if (current()) onError(String(error)); });
    return () => { live = false; if (generation.current === request) generation.current++; void listening.then((stop) => stop(), () => {}); };
  }, [chatId, workspaceId, enabled, onError]);
  if (!enabled || saved?.chatId !== chatId) return undefined;
  const renderedGeneration = generation.current;
  return {
    isPlanMode: saved.mode === "plan",
    disabled: busy || saved.saving || pending.current,
    onToggle() {
      if (generation.current !== renderedGeneration || busy || pending.current) return;
      const request = generation.current;
      const mode: Mode = saved.mode === "plan" ? "default" : "plan";
      pending.current = true;
      setSaved({ ...saved, saving: true });
      void invoke<unknown>("local_plan_mode_set", { chatId, workspaceId, mode }).then((value) => {
        const confirmed = parseMode(value);
        if (generation.current === request) setSaved({ chatId, mode: confirmed, saving: false });
      }).catch((error: unknown) => {
        if (generation.current === request) { setSaved(saved); onError(String(error)); }
      }).finally(() => { if (generation.current === request) pending.current = false; });
    },
  };
}
