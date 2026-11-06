// Sidebar help menu content, after Conductor's footer help popover (REA read of its `Nna` footer bundle code).
// Conductor's order: Keyboard shortcuts, Docs, Best practices, Changelog, Send feedback, Discord,
// Submit a prompt, Diagnostics, Open debug tools, then a version line. Items we cannot back yet
// (Discord, Submit a prompt, Diagnostics, Open debug tools) are left out rather than shown dead.

export const REPO_URL = "https://github.com/reason-machines/openconductor";

export const FEEDBACK_URL = `${REPO_URL}/issues/new`;

export type HelpIcon = "keyboard" | "book" | "message";

export type HelpAction =
  | { kind: "shortcuts" }
  | { kind: "url"; url: string };

export interface HelpItem {
  label: string;
  /** Leading 16px icon; items without one are indented to the icon column (Conductor's `ml-6`). */
  icon?: HelpIcon;
  /** Registered command whose shortcut is shown at the right edge. */
  commandId?: string;
  /** Opens outside the app; Conductor marks these with a small arrow after the label. */
  external?: boolean;
  action: HelpAction;
}

export const HELP_ITEMS: readonly HelpItem[] = [
  { label: "Keyboard shortcuts", icon: "keyboard", commandId: "openKeyboardShortcuts", action: { kind: "shortcuts" } },
  { label: "Docs", icon: "book", external: true, action: { kind: "url", url: `${REPO_URL}#readme` } },
  { label: "Best practices", external: true, action: { kind: "url", url: `${REPO_URL}/tree/main/docs` } },
  { label: "Changelog", external: true, action: { kind: "url", url: `${REPO_URL}/releases` } },
  { label: "Send feedback", icon: "message", commandId: "sendFeedback", action: { kind: "url", url: FEEDBACK_URL } },
];

/** Version footer; Conductor's reads "Conductor v<app> • Claude Code <v> • Codex <v>", with "..." while unknown. */
export function versionLine(appVersion: string | undefined, appName = "OpenConductor"): string {
  return `${appName} v${appVersion ?? "..."}`;
}

/** Next focused item for ArrowDown/ArrowUp, wrapping at both ends like Conductor's menu; -1 when nothing is focused. */
export function nextIndex(current: number, count: number, key: "ArrowDown" | "ArrowUp"): number {
  if (count === 0 || current === -1) return -1;
  return key === "ArrowDown" ? (current + 1) % count : (current - 1 + count) % count;
}
