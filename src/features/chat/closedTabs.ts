// parity:chat.tabs Cmd+W (nav.closeTab) and Cmd+Shift+T (nav.reopenTab).
// Conductor 0.87.6 (REA-read on Sven's Mac: index-BGEQ8YjU.js store,
// `pushClosedTab` / `popClosedTab` / `recordViewedSession`; renderApp
// workspace view `oi("nav.closeTab", …)` @ byte 7,447,157) keeps, per
// workspace, the last 10 closed tabs newest first (`QOt` = 10) and the last 20
// chats shown (`JOt` = 20). Closing a chat or file tab pushes it; closing the
// PR tab does not. ⌘⇧T pops the newest and opens it again. Closing the chat on
// screen shows the most recently viewed chat still open, else the last one.

import type { ReviewTab } from "../diff/ReviewButton.tsx";

/** Conductor's `QOt`. */
export const CLOSED_TAB_LIMIT = 10;
/** Conductor's `JOt`. */
export const VIEW_HISTORY_LIMIT = 20;

/** A tab ⌘⇧T can bring back: a chat tab, or the "All changes" tab (Conductor's file tab). */
export type ClosedTab = { kind: "chat"; tab: ReviewTab } | { kind: "diff" };

const closed = new Map<string, ClosedTab[]>();
const viewed = new Map<string, string[]>();

/** Remember a closed tab of `workspaceId`, newest first, keeping at most 10. */
export function pushClosedTab(workspaceId: string, tab: ClosedTab): void {
  closed.set(workspaceId, [tab, ...(closed.get(workspaceId) ?? [])].slice(0, CLOSED_TAB_LIMIT));
}

/** Take the newest closed tab of `workspaceId`, if any. */
export function popClosedTab(workspaceId: string): ClosedTab | undefined {
  const [top, ...rest] = closed.get(workspaceId) ?? [];
  closed.set(workspaceId, rest);
  return top;
}

/** Note that chat `chatId` of `workspaceId` is on screen. */
export function recordViewedChat(workspaceId: string, chatId: string): void {
  const h = viewed.get(workspaceId) ?? [];
  if (h[0] === chatId) return;
  viewed.set(workspaceId, [chatId, ...h.filter((c) => c !== chatId)].slice(0, VIEW_HISTORY_LIMIT));
}

/**
 * The chat to show after closing `closing`, which is on screen: the most
 * recently viewed chat still open, else the last open one (`open` in strip
 * order, `closing` already removed or not).
 */
export function chatAfterClose(workspaceId: string, closing: string, open: readonly string[]): string | undefined {
  const rest = open.filter((c) => c !== closing);
  return (viewed.get(workspaceId) ?? []).find((c) => c !== closing && rest.includes(c)) ?? rest[rest.length - 1];
}

/** Test hook: forget every workspace's history. */
export function resetClosedTabs(): void {
  closed.clear();
  viewed.clear();
}
