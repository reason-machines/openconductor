// The Claude Code approval level for views (approvalLevel.ts): the account's
// level for the settings rows, and one chat's level for its message box.
// Both follow changes made elsewhere: Settings saves (SETTINGS_CHANGED) and
// the backend's `approval-level-changed` (a repository's or a chat's choice).
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { getSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { APPROVAL_LEVEL_CHANGED, approvalLevel, chatApprovalLevel, setChatApprovalLevel, type ApprovalLevel, type ChatApprovalLevel } from "./approvalLevel";

/** Account › "Claude Code tool approvals"; null until read. */
export function useAccountApprovalLevel(): ApprovalLevel | null {
  const [level, setLevel] = useState<ApprovalLevel | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      getSettings().then(
        (s) => live && setLevel(approvalLevel(s)),
        (err) => console.warn("Failed to read Claude Code tool approvals", err),
      );
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, []);
  return level;
}

export interface ApprovalLevelControl {
  chat: ChatApprovalLevel;
  /** A turn runs or a change is being saved: the level belongs to a whole turn. */
  disabled: boolean;
  onChange(level: ApprovalLevel): void;
}

/** The level of one Claude Code chat and its picker; undefined for other agents and until read. */
export function useChatApprovalLevel(chatId: string, workspaceId: string, enabled: boolean, busy: boolean, onError: (message: string) => void): ApprovalLevelControl | undefined {
  const [state, setState] = useState<{ chatId: string; chat: ChatApprovalLevel }>();
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    setState(undefined);
    setSaving(false);
    if (!enabled || !isTauri()) return;
    let live = true;
    const current = () => live && generation.current === request;
    const load = () =>
      chatApprovalLevel(chatId, workspaceId).then(
        (chat) => {
          if (current()) setState({ chatId, chat });
        },
        // No picker without a level (an archived workspace, the browser preview); only a change reports an error.
        (error: unknown) => console.warn("Claude Code approval level not read", error),
      );
    void load();
    window.addEventListener(SETTINGS_CHANGED, load);
    // Any change may be this chat's: its own, or its repository's.
    const listening = listen(APPROVAL_LEVEL_CHANGED, () => void load());
    void listening.catch(() => undefined);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
      void listening.then((stop) => stop(), () => {});
    };
  }, [chatId, workspaceId, enabled, onError]);
  if (!enabled || state?.chatId !== chatId) return undefined;
  return {
    chat: state.chat,
    disabled: busy || saving,
    onChange(level) {
      if (busy || saving || level === state.chat.level) return;
      const request = generation.current;
      setSaving(true);
      setChatApprovalLevel(chatId, workspaceId, level)
        .then(
          (chat) => {
            if (generation.current === request) setState({ chatId, chat });
          },
          (error: unknown) => {
            if (generation.current === request) onError(String(error));
          },
        )
        .finally(() => {
          if (generation.current === request) setSaving(false);
        });
    },
  };
}
