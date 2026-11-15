// parity:sidebar.ws-unread
// Wires chat attention (features/chat/attention.ts) to the chat's unread
// flag; the decisions are in autoUnread.ts.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { onChatAttention } from "../features/chat/attention.ts";
import { shownChat, unreadTarget } from "./autoUnread.ts";
import { isChatUnread } from "./chatUnread.ts";
import { playCompletionSound } from "../settings/sound.ts";
import { notificationPermissionGranted } from "../settings/notificationPermission.ts";
import type { Action } from "./store";
import type { AppState } from "./types.ts";
import type { Settings } from "../settings/types.ts";

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

  // H9: load settings once so sound and notification effects can read the toggles.
  const settingsRef = useRef<Settings | null>(null);
  useEffect(() => {
    invoke<Settings>("get_settings").then((s) => { settingsRef.current = s; }).catch(() => {});
  }, []);

  useEffect(
    () =>
      onChatAttention((chatId) => {
        // H9: play completion sound on every agent turn / wait event.
        const soundType = settingsRef.current?.general?.sound_type;
        if (soundType) playCompletionSound(soundType);

        // H9: send native notification when window lacks focus and setting is on.
        if (settingsRef.current?.general?.send_native_notification && !document.hasFocus()) {
          void notificationPermissionGranted().then((granted) => {
            if (granted) new window.Notification("Agent finished", { silent: true });
          });
        }

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
