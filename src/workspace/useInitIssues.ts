// React side of initIssues: mount once (App) to turn each reported issue into
// a toast that stays until dismissed, with "View logs" when there is a log.
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { ToastAction } from "../components/toastTiming";
import { subscribeInitIssues, VIEW_LOGS, type InitIssue } from "./initIssues";

/** Opens the log in its default app, as Conductor's `open "<path>"` does. */
export async function openInitLog(path: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("plugin:opener|open_path", { path });
}

export function initIssueAction(issue: InitIssue): ToastAction | undefined {
  const path = issue.logPath;
  if (!path) return undefined;
  return { label: VIEW_LOGS, onClick: () => void openInitLog(path).catch(() => undefined) };
}

export function useInitIssues(showError: (message: string, opts: { sticky: true; action?: ToastAction }) => void) {
  useEffect(() => subscribeInitIssues((issue) => showError(issue.message, { sticky: true, action: initIssueAction(issue) })), [showError]);
}
