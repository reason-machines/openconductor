// parity:sidebar.ws-unread
// The unread dot on a chat tab. Conductor's chat tab (`u8i`, renderApp-D_fmY7hW.js
// char 7,374,777) puts `l8i({...session, status})` (char 7,370,428) before the
// title. `l8i` shows, in order: the plan icon for needs_plan_response, the
// question icon for needs_user_input / needs_user_permission, then, when the
// chat is unread and neither working nor waiting, a filled lucide circle
// (`X3`, char 607,806) `size-2 shrink-0 text-unread` with a transparent
// stroke. `text-unread` is `color: var(--unread)` (renderApp-BYEcFwvt.css):
// #a4847f light, #cca694 dark. The dot follows `session.unread`, so it clears
// when the chat is read (read-on-view, "Mark as read", the workspace marked read).
import { aggregateSessions } from "./rowStatus.ts";

/** Statuses that hide the unread dot: they draw their own icon or the typing indicator instead. */
const HIDES_DOT = new Set(["needs_plan_response", "needs_user_input", "needs_user_permission", "working", "waiting"]);

/** Whether a chat tab shows the unread dot (Conductor's `l8i` with showUnread). */
export function chatTabUnreadDot(unread: boolean, status: string | undefined): boolean {
  return unread && !HIDES_DOT.has(status ?? "idle");
}

/**
 * The status a chat tab reads from the chat statuses: its own, or its Claude Code
 * chat's (`<chat id>:claude`, features/chat/claudeChat), whichever is more urgent.
 */
export function chatTabStatus(statuses: ReadonlyMap<string, string>, chatId: string): string {
  const own = [statuses.get(chatId), statuses.get(`${chatId}:claude`)].filter((s): s is string => s !== undefined);
  return aggregateSessions(own);
}
