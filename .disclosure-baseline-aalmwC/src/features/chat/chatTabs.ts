// parity:chat.tabs
// The chat tab strip's "+" and ⌘T, as Conductor 0.87.6 has them (REA-read
// renderApp chunk: the strip `lco`, its "+" `g8i`, the session tab `u8i`).
// Without terminal or browser tabs, "+" is a ghost icon button that makes a
// new chat in the same workspace (same worktree, so "same files") and shows
// it; its tooltip is "New chat, same files" with the nav.newTab shortcut (⌘T),
// and ⌘T does the same. A workspace holds at most 5 closable tabs (10 with
// the experimental "tab freak mode", which OpenConductor does not have): at
// the limit the button is disabled with the tooltip "Maximum 5 tabs allowed",
// and ⌘T shows the warning toast "Maximum of 5 tabs allowed". A new session's
// title is "Untitled" until it is renamed.

/** Conductor's closable tab limit per workspace (`nFt`; `rFt` = 10 in tab freak mode). */
export const CHAT_TAB_LIMIT = 5;

/** A new session's title (Conductor's `V0`). */
export const NEW_CHAT_TITLE = "Untitled";

/** The "+" tooltip's text, before the shortcut. */
export const NEW_CHAT_LABEL = "New chat, same files";

/** Chat id of a chat opened with "+" or ⌘T: `<workspace id>:chat:<n>`. */
export const CHAT_ID_SEGMENT = ":chat:";

/** Whether another tab may open: Conductor counts the workspace's tabs against the limit. */
export const atTabLimit = (openTabs: number, limit: number = CHAT_TAB_LIMIT): boolean => openTabs >= limit;

/** The disabled "+"'s tooltip. */
export const tabLimitTooltip = (limit: number = CHAT_TAB_LIMIT): string => `Maximum ${limit} tabs allowed`;

/** The toast ⌘T shows at the limit. */
export const tabLimitToast = (limit: number = CHAT_TAB_LIMIT): string => `Maximum of ${limit} tabs allowed`;

/** The "+" tooltip: "New chat, same files ⌘T", or the limit when no tab can open. */
export function newChatTooltip(openTabs: number, shortcut: string | null, limit: number = CHAT_TAB_LIMIT): string {
  if (atTabLimit(openTabs, limit)) return tabLimitTooltip(limit);
  return shortcut ? `${NEW_CHAT_LABEL} ${shortcut}` : NEW_CHAT_LABEL;
}

/** A new chat's id in the workspace; `n` keeps ids made in the same millisecond apart. */
export const newChatId = (workspaceId: string, now: number, n: number): string => `${workspaceId}${CHAT_ID_SEGMENT}${now.toString(36)}-${n}`;
