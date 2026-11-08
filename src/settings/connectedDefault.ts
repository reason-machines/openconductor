import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { inTauri } from "../backend";
import { SETTINGS_CHANGED } from "./appearance";
import type { AgentKind, Settings } from "./types";
import { rememberSettings } from "./useSettings";

const pending = new Map<AgentKind, Promise<void>>();

export function rememberConnection(agent: AgentKind): Promise<void> {
  if (!inTauri()) return Promise.resolve();
  const existing = pending.get(agent);
  if (existing) return existing;
  const request = invoke<Settings | null>("initialize_default_runtime", { agent }).then((settings) => {
    if (!settings) return;
    rememberSettings(settings);
    window.dispatchEvent(new Event(SETTINGS_CHANGED));
  }).finally(() => pending.delete(agent));
  pending.set(agent, request);
  return request;
}

export function useConnectedDefault(agent: AgentKind, connected: boolean) {
  useEffect(() => {
    if (connected) void rememberConnection(agent).catch((error: unknown) => console.error("Could not save first connected runtime", error));
  }, [agent, connected]);
}
