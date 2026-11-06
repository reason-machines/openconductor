// parity:sidebar.ws-unread
// A chat that wants the user: its turn settled, or its agent waits on an
// answer. Conductor marks such a chat unread unless the user is looking at it:
//
// - Turn end (index-BGEQ8YjU.js `applyTurnCompletionTails` @1,529,959): only a
//   successful turn that did not settle as waiting, with no queued message
//   left to send.
// - A wait on the user (`_p` @2,940,721, called on every needs_* status:
//   plan @2,945,001, question @2,945,451, MCP and Codex permissions
//   @2,946,028/@2,946,583, tool approval @2,947,277).
//
// The chat runtimes (reasonChat.ts, codexChat.ts) report here; the app decides
// whether the chat is in view (state/autoUnread.ts).
import type { ChatQueue } from "./queue.ts";
import type { TurnStatus } from "./types.ts";

type Listener = (chatId: string) => void;
const listeners = new Set<Listener>();

export function onChatAttention(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function chatWantsAttention(chatId: string): void {
  for (const fn of listeners) fn(chatId);
}

/**
 * A turn that ended with `status`, leaving the chat's queue as `queue`, settled
 * the chat: it completed, and nothing runs or waits to be sent after it (a
 * steered turn that superseded it is still running, so the queue is busy).
 */
export function turnSettled(status: TurnStatus, queue: ChatQueue): boolean {
  return status === "completed" && queue.status === "idle" && queue.items.length === 0;
}
