import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";

export interface InstalledReasonCli { path: string; version: string; warning?: string }
let ready: Promise<InstalledReasonCli | null> | undefined;

/** One current-version check per app launch, shared by onboarding and sign-in. */
export function ensureReasonCli(): Promise<InstalledReasonCli | null> {
  if (!inTauri()) return Promise.resolve(null);
  ready ??= invoke<InstalledReasonCli>("reason_cli_ensure_current").catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}
