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

/** Background CLI setup status, shown in-flow in the sidebar footer (never over the app). */
export type ReasonCliSetup =
  | { status: "idle" }
  | { status: "installing" }
  | { status: "ready"; warning?: string }
  | { status: "error"; message: string };

let setup: ReasonCliSetup = { status: "idle" };
const listeners = new Set<() => void>();
const publish = (next: ReasonCliSetup) => { setup = next; listeners.forEach((l) => l()); };
export const reasonCliSetup = () => setup;
export function subscribeReasonCliSetup(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Starts the install or update in the background; never awaited by startup. */
export function startReasonCliSetup(): void {
  if (!inTauri() || setup.status === "installing") return;
  publish({ status: "installing" });
  ensureReasonCli().then(
    (result) => publish({ status: "ready", warning: result?.warning }),
    (error: unknown) => publish({ status: "error", message: error instanceof Error ? error.message : String(error) }),
  );
}
