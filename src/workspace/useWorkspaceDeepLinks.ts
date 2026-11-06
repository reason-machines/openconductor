import { useEffect, useState, type Dispatch } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { inTauri } from "../backend";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import { lastWorkspaceLink, openWorkspaceLinkActions, type WorkspaceLink } from "./deepLink";

/**
 * Selects the workspace an openconductor://workspace?id=<id> link names: the
 * link that launched the app (getCurrent) and each one opened while it runs
 * (onOpenUrl). A link that arrives before its workspace is loaded waits for it.
 */
export function useWorkspaceDeepLinks(state: AppState, dispatch: Dispatch<Action>): void {
  const [pending, setPending] = useState<WorkspaceLink | null>(null);

  useEffect(() => {
    if (!inTauri()) return;
    const take = (urls: string[] | null) => {
      const link = lastWorkspaceLink(urls);
      if (link) setPending(link);
    };
    void getCurrent().then(take, () => undefined);
    const unlisten = onOpenUrl(take);
    return () => void unlisten.then((off) => off(), () => undefined);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const actions = openWorkspaceLinkActions(state, pending);
    if (!actions) return;
    setPending(null);
    for (const action of actions) dispatch(action);
  }, [pending, state, dispatch]);
}
