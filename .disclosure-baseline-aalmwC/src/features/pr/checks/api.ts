// Bridge to the Checks tab commands (src-tauri/src/pr/checks_commands.rs).
// Outside Tauri the calls answer from demo data so the tab can be tried in a
// browser.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Check } from "../types";
import { DEMO_LOG } from "./demo";

export type CheckLog =
  | { kind: "logs"; name: string | null; conclusion: string | null; logs: string; jobId: number }
  | { kind: "unavailable"; name: string | null; conclusion: string | null; message: string; annotation: string | null; jobId: number };

/** The last 1,000 lines of a failing check's GitHub Actions job log. */
export async function checkLog(repoPath: string, check: Check): Promise<CheckLog> {
  if (!isTauri()) return { kind: "logs", name: check.name, conclusion: check.conclusion, logs: DEMO_LOG, jobId: Number(/\/job\/(\d+)/.exec(check.detailsUrl ?? "")?.[1] ?? 0) };
  return invoke<CheckLog>("pr_check_log", {
    repoPath,
    check: { name: check.name, conclusion: check.conclusion, detailsUrl: check.detailsUrl },
  });
}

/** `gh run rerun <run> --failed` for each run behind `detailsUrls`; resolves to the run ids. */
export async function rerunFailedChecks(repoPath: string, detailsUrls: string[]): Promise<number[]> {
  if (!isTauri()) return [];
  return invoke<number[]>("pr_rerun_failed_checks", { repoPath, detailsUrls });
}

/** The repository's `custom_prompt_fix_errors` from conductor.db; none in the browser preview or for an unknown repository. */
export async function repoFixErrorsPrompt(repoId: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("db_repo_prompt", { repoId, prompt: "fixErrors" });
  } catch (e) {
    console.warn("fix errors: no repository prompt", e);
    return null;
  }
}
