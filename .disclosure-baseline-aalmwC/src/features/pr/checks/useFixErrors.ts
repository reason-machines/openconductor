// parity:pr.checks:ui
// Fix errors, shared by the Checks list's button and the `git.fixErrors`
// shortcut, with one in-flight flag as Conductor's `isFixingChecks`
// (renderApp-D_fmY7hW.js @ ~2,279,028 header button, ~2,299,938 shortcut).
import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Check } from "../types";
import { checkLog, repoFixErrorsPrompt } from "./api";
import { collectFixErrors, FIX_ERRORS_MESSAGE, type FixErrorsAttachment, type FixErrorsSources } from "./fixErrors";

export interface FixErrors {
  fixing: boolean;
  /** Send the failing checks' logs and the fix instructions to the workspace's own chat. */
  run: (failing: Check[]) => Promise<void>;
}

export interface FixErrorsArgs {
  worktree: string | null;
  repoId: string;
  sendToChat: (text: string, attachments: FixErrorsAttachment[]) => void;
  notify?: (kind: "info" | "error", message: string) => void;
  sources?: FixErrorsSources;
}

const defaultSources: FixErrorsSources = { log: checkLog, customPrompt: repoFixErrorsPrompt };

export function useFixErrors({ worktree, repoId, sendToChat, notify, sources = defaultSources }: FixErrorsArgs): FixErrors {
  const [fixing, setFixing] = useState(false);
  const inFlight = useRef(false);
  const latest = useRef({ worktree, repoId, sendToChat, notify, sources });
  latest.current = { worktree, repoId, sendToChat, notify, sources };
  const run = useCallback(async (failing: Check[]) => {
    const { worktree, repoId, sendToChat, notify, sources } = latest.current;
    // The browser preview has no checkout; its demo logs need none.
    if (inFlight.current || (!worktree && isTauri())) return;
    inFlight.current = true;
    setFixing(true);
    try {
      sendToChat(FIX_ERRORS_MESSAGE, await collectFixErrors(worktree ?? "", failing, repoId, sources));
    } catch (e) {
      notify?.("error", `Failed to fix checks: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      inFlight.current = false;
      setFixing(false);
    }
  }, []);
  return useMemo(() => ({ fixing, run }), [fixing, run]);
}
