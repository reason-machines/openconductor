// React side of initIssues: mount once (App) to turn each reported issue into
// a toast that stays until dismissed, with "View logs" when there is a log.
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { ToastAction } from "../components/toastTiming";
import { subscribeInitIssues, VIEW_LOGS, type InitIssue } from "./initIssues";

/** One `openInitLog` call as the E2E seam records it. */
export interface OpenedLog {
  path: string;
  /** The opener's error, e.g. no default app on a headless runner; absent when it opened. */
  error?: string;
}

/** Opens the log in its default app, as Conductor's `open "<path>"` does. */
export async function openInitLog(path: string): Promise<void> {
  if (!inTauri()) return;
  // E2E seam: Tauri locks __TAURI_INTERNALS__.invoke, so tests/e2e sets this
  // array to observe the real opener call (path and outcome); it changes nothing.
  const seen = (window as { __OC_E2E_OPENED_LOGS__?: OpenedLog[] }).__OC_E2E_OPENED_LOGS__;
  try {
    await invoke("plugin:opener|open_path", { path });
    seen?.push({ path });
  } catch (e) {
    seen?.push({ path, error: String(e) });
    throw e;
  }
}

export function initIssueAction(issue: InitIssue): ToastAction | undefined {
  const path = issue.logPath;
  if (!path) return undefined;
  return { label: VIEW_LOGS, onClick: () => void openInitLog(path).catch(() => undefined) };
}

export function useInitIssues(showError: (message: string, opts: { sticky: true; action?: ToastAction }) => void) {
  useEffect(() => subscribeInitIssues((issue) => showError(issue.message, { sticky: true, action: initIssueAction(issue) })), [showError]);
}
