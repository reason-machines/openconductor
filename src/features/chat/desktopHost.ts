// The app around a chat runtime (chatRuntime.ts): Tauri `invoke`, the
// webview's localStorage, the turn-changes cache, and persistence in
// `conductor.db` when running in the desktop app.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { turnChanges } from "../diff/useTurnChanges.ts";
import type { ChatHost } from "./chatRuntime.ts";

export const desktopHost: ChatHost = {
  invoke: (cmd, args) => invoke(cmd, args),
  persist: isTauri(),
  recordTurnChanges: (turn, files) => turnChanges.record(turn, files),
  storage: localStorage,
};
