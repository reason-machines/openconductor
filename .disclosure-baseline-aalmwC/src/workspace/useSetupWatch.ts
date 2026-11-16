// React side of setupWatch: the App-level scripts://event listener and the
// per-workspace "Running setup script..." flag.
import { useEffect, useSyncExternalStore } from "react";
import { onScriptEvent } from "../scripts/api";
import { handleScriptEvent, isWatching, subscribeWatch } from "./setupWatch";

/** True while a setup the create flow started for this workspace is running. */
export function useCreateSetupRunning(workspaceId: string): boolean {
  return useSyncExternalStore(subscribeWatch, () => isWatching(workspaceId));
}

/** Mount once (App): listens to scripts://event and shows the failure toast. */
export function useSetupWatch(showError: (message: string) => void) {
  useEffect(() => {
    let off: (() => void) | null = null;
    let live = true;
    onScriptEvent((e) => {
      const toast = handleScriptEvent(e);
      if (toast) showError(toast);
    }).then((unlisten) => (live ? (off = unlisten) : unlisten()), () => undefined);
    return () => {
      live = false;
      off?.();
    };
  }, [showError]);
}
