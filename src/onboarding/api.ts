// First-run onboarding IPC (src-tauri/src/onboarding_commands.rs). In the
// desktop app the step lives in conductor.db's `settings` table under
// Conductor's key; outside Tauri (vite preview) it lives in localStorage.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import { FIRST_RUN_DONE_STEP } from "./firstRun";
import { ensureReasonCli } from "./reasonCli";
import { selectFirstRunAgent } from "./firstRunAgent";
import type { AgentKind } from "../settings/types";

/** localStorage key of the step in the browser preview. */
export const PREVIEW_STEP_KEY = "openconductor.firstRunOnboardingStep";
const PREVIEW_STATE_KEY = "openconductor.shell.v1";

/** The stored `first_time_onboarding_step`, raw; null when never written. */
export async function readFirstRunStep(): Promise<string | null> {
  if (inTauri()) return (await invoke<string | null>("db_first_run_onboarding_step")) ?? null;
  return localStorage.getItem(PREVIEW_STEP_KEY);
}

/** How many repositories the user has: conductor.db rows, or the preview's saved state. */
export async function countRepos(): Promise<number> {
  if (inTauri()) return (await invoke<unknown[]>("db_list_repos")).length;
  try {
    const saved = JSON.parse(localStorage.getItem(PREVIEW_STATE_KEY) ?? "null") as { repos?: unknown[] } | null;
    return saved?.repos?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Mark onboarding finished (`first_time_onboarding_step` 999, `onboarding_step` done). */
export async function finishFirstRun(agent: AgentKind = "reason"): Promise<void> {
  await ensureReasonCli();
  await selectFirstRunAgent(agent);
  if (inTauri()) return invoke("db_finish_first_run_onboarding");
  localStorage.setItem(PREVIEW_STEP_KEY, String(FIRST_RUN_DONE_STEP));
}
