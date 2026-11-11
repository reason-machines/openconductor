// What an empty workspace chat shows, after Conductor 0.87.6 (renderApp-D_fmY7hW.js):
// - `nPo` picks: no chat of the workspace has a user message yet → the first-chat
//   intro (`x9s`, local workspace); otherwise the new-chat note (`RIo`).
// - `x9s`: "You’re in a new copy of <repo> called <dir>" in a muted box, then the
//   steps "Branched <branch> from <parent>" and "Created <dir> …". Nothing for an
//   archived or unstarted workspace; the steps only while initializing, setting up,
//   ready or failed.
// - `RIo`: "New chat in /<dir>." then "Add chat transcripts:" with one chip per
//   other chat that has a user message (newest first, 5 shown, the rest behind
//   "+N more"); a chip attaches that chat's transcript as
//   "Transcript of <title>.md" (fork.ts formats it, as for Fork to new workspace).
// Pure: no React, no Tauri, so chatEmptyState.test.ts covers it.

import type { ChatAgentId } from "./agentChoice.ts";
import type { ChatMessage } from "./types.ts";

export interface OtherChat {
  chatId: string;
  title: string;
  agent: ChatAgentId;
  /** Last user message (ms); null when the chat has none. */
  lastUserMessageAt: number | null;
}

export type EmptyState =
  | { kind: "first"; steps: boolean }
  | { kind: "more"; transcripts: OtherChat[]; overflow: OtherChat[] }
  | { kind: "none" };

/** Conductor's `wIo`: chips shown before "+N more". */
export const MAX_VISIBLE = 5;

const STEP_STATES = new Set(["initializing", "failed", "setting_up", "ready"]);

/** Which empty state a chat shows. `state` is `workspaces.state`; rows from before it count as ready. */
export function emptyState(otherChats: readonly OtherChat[], state: string | undefined): EmptyState {
  const withMessages = otherChats.filter((c) => c.lastUserMessageAt !== null).sort((a, b) => b.lastUserMessageAt! - a.lastUserMessageAt!);
  if (withMessages.length === 0) {
    if (state === "archived" || state === "unstarted") return { kind: "none" };
    return { kind: "first", steps: state === undefined || STEP_STATES.has(state) };
  }
  // Conductor's `uKn`: all items when they fit, else the first max-1 and "+N more".
  const fits = withMessages.length <= MAX_VISIBLE;
  return {
    kind: "more",
    transcripts: fits ? withMessages : withMessages.slice(0, MAX_VISIBLE - 1),
    overflow: fits ? [] : withMessages.slice(MAX_VISIBLE - 1),
  };
}

/** Last user message of a transcript (ms), or null. */
export function lastUserMessageAt(messages: readonly ChatMessage[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && !m.senderSessionId) {
      const t = Date.parse(m.createdAt);
      return Number.isNaN(t) ? 0 : t;
    }
  }
  return null;
}
