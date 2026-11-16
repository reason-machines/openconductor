// "Follow-up behavior" for the chat views: the `default_message_send_mode`
// table pref, re-read whenever settings are saved elsewhere (the General
// page announces its change with SETTINGS_CHANGED), so an open chat follows
// the setting without a reload.
import { useEffect, useState } from "react";
import type { FollowUpMode } from "../features/chat/queue";
import { getSettings } from "./api";
import { SETTINGS_CHANGED } from "./appearance";
import { ENUM_PREFS, enumPref } from "./prefs";

export function useFollowUpMode(): FollowUpMode {
  const [mode, setMode] = useState<FollowUpMode>(ENUM_PREFS.default_message_send_mode.default);
  useEffect(() => {
    let live = true;
    const load = () =>
      getSettings().then(
        (s) => live && setMode(enumPref(s, "default_message_send_mode")),
        (err) => console.warn("Failed to read Follow-up behavior", err),
      );
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(SETTINGS_CHANGED, load);
    };
  }, []);
  return mode;
}
