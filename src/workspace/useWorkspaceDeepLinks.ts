import { useEffect, useState, type Dispatch } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { inTauri } from "../backend";
import type { Action } from "../state/store";
import type { AppState } from "../state/types";
import { requestChat } from "../state/openChat";
import { lastWorkspaceLink, openWorkspaceLinkActions, type WorkspaceLink } from "./deepLink";

/**
 * Selects the workspace an openconductor://workspace?id=<id>[&session=<id>] link
 * names: the link that launched the app (getCurrent) and each one opened while
 * it runs (onOpenUrl). A link that arrives before its workspace is loaded waits
 * for it. When the link includes a session, requestChat opens that tab once the
 * workspace view is on screen (Conductor's yIo / tab-strip navigation).
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
    // If the link named a session, ask the workspace view to open that chat tab
    // once it mounts. requestChat stores the request keyed by workspace id;
    // WorkspaceView.tsx reads it with takeChatRequest on its first render and on
    // onChatRequest notifications (state/openChat.ts).
    if (pending.sessionId) requestChat(pending.sessionId);
  }, [pending, state, dispatch]);
}
