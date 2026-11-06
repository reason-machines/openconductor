// parity:sidebar.ws-unread
// Wires chat attention (features/chat/attention.ts) to the chat's unread
// flag; the decisions are in autoUnread.ts.
import { useEffect, useRef, useState } from "react";
import { onChatAttention } from "../features/chat/attention.ts";
import { shownChat, unreadTarget } from "./autoUnread.ts";
import { isChatUnread } from "./chatUnread.ts";
import type { Action } from "./store";
import type { AppState } from "./types.ts";

/** Whether the app window has focus (Conductor's `appWindowFocused`, renderApp `wzt` @7,159,062). */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener("focus", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("focus", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  return focused;
}

/** A chat that wants attention is marked unread unless the user is looking at it. */
export function useAutoUnread(state: AppState, dispatch: (action: Action) => void): void {
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(
    () =>
      onChatAttention((chatId) => {
        const target = unreadTarget(chatId, { shownChatId: shownChat(), focused: document.hasFocus() });
        if (!target) return;
        const repo = stateRef.current.repos.find((r) => r.workspaces.some((w) => w.id === target.workspaceId));
        const ws = repo?.workspaces.find((w) => w.id === target.workspaceId);
        if (!repo || !ws || isChatUnread(ws, chatId)) return;
        dispatch({ type: "setChatUnread", repoId: repo.id, workspaceId: ws.id, chatId, unread: true, at: Date.now() });
      }),
    [dispatch],
  );
}
