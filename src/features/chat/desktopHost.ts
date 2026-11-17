// The app around a chat runtime (chatRuntime.ts): Tauri `invoke`, the
// webview's localStorage, the turn-changes cache, and persistence in
// `conductor.db` when running in the desktop app.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { turnChanges } from "../diff/useTurnChanges.ts";
import type { ChatHost } from "./chatRuntime.ts";
import { commentStoreFor } from "../diff/commentsApi.ts";

export const desktopHost: ChatHost = {
  invoke: (cmd, args) => invoke(cmd, args),
  persist: isTauri(),
  recordTurnChanges: (turn, files) => turnChanges.record(turn, files),
  storage: localStorage,
  async onPromptHandoff(workspaceId, attachments) {
    const ids = [...new Set(attachments.flatMap((attachment) => attachment.commentId ? [attachment.commentId] : []))];
    if (ids.length > 0) await commentStoreFor(workspaceId).markReviewed(ids);
  },
};
