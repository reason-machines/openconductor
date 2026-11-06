// parity:sidebar.ws-unread
// A chat that wants the user: its turn settled, or its agent waits on an
// answer. Conductor marks such a chat unread unless the user is looking at it:
//
// - Turn end (index-BGEQ8YjU.js `applyTurnCompletionTails` @1,529,959): only a
//   successful turn that did not settle as waiting, with no queued message
//   left to send.
// - A wait on the user (`_p` @2,940,721, called right after every
//   `updateSessionStatus(needs_*)`: ExitPlanMode's plan review
//   `needs_plan_response` @2,945,001, AskUserQuestion `needs_user_input`
//   @2,945,451, Codex MCP elicitation and Codex permission approval
//   `needs_user_input` @2,946,028/@2,946,583, tool approval
//   `needs_user_permission` @2,947,277).
//
// Each request event that opens a wait signals it once (a Reason permission
// request, a Codex approval or consent). A chat whose status enters plan
// review or user input signals it too (`enteredWait`, from
// `reportChatStatus`), so any runtime that reports those statuses marks the
// chat the way Conductor's `_p` does. The chat runtimes (reasonChat.ts,
// codexChat.ts) report here; the app decides whether the chat is in view
// (state/autoUnread.ts).
import type { ChatQueue, SessionStatus } from "./queue.ts";
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

/**
 * The waits whose status Conductor sets just before `_p` and that no request
 * event here signals by itself: plan review (ExitPlanMode) and user input
 * (AskUserQuestion, MCP elicitation). `needs_user_permission` is signalled per
 * request instead, because a second request in the same wait asks again.
 */
const STATUS_WAITS: ReadonlySet<SessionStatus> = new Set(["needs_plan_response", "needs_user_input"]);

/** The chat's status moved from `prev` into plan review or user input: a new wait on the user. */
export function enteredWait(prev: SessionStatus | undefined, next: SessionStatus): boolean {
  return prev !== next && STATUS_WAITS.has(next);
}

/**
 * Whether a Codex step asks for the user: a new tool approval, or a new MCP
 * elicitation or permission consent (Conductor's `_p` after
 * CODEX_MCP_ELICITATION and CODEX_PERMISSION_APPROVAL). A consent that moved
 * the chat into `needs_user_input` is already signalled by `enteredWait`.
 */
export function codexAsks(
  prev: { approvals: readonly { requestId: number | string }[]; consents: readonly { requestId: number | string }[]; status: SessionStatus },
  next: { approvals: readonly { requestId: number | string }[]; consents: readonly { requestId: number | string }[]; status: SessionStatus },
): boolean {
  const fresh = (now: readonly { requestId: number | string }[], before: readonly { requestId: number | string }[]) =>
    now.some((a) => !before.some((b) => b.requestId === a.requestId));
  if (fresh(next.approvals, prev.approvals)) return true;
  return fresh(next.consents, prev.consents) && !enteredWait(prev.status, next.status);
}
