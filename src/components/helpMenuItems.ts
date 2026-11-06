// Sidebar help menu content, after Conductor's footer help popover (REA read of its `Nna` footer bundle code;
// items at renderApp-D_fmY7hW.js @9,789,300-9,792,900).
// Conductor's order: Keyboard shortcuts, Docs, Best practices, Changelog, Send feedback, Discord,
// Submit a prompt, Diagnostics, Open debug tools, then a version line. Discord opens Conductor's own
// community server; OpenConductor has none, so that one item is left out rather than pointed elsewhere.

export const REPO_URL = "https://github.com/reason-machines/openconductor";

export const FEEDBACK_URL = `${REPO_URL}/issues/new`;

/** Help › Docs and the palette's "Open documentation". */
export const DOCS_URL = `${REPO_URL}#readme`;

/** Help › Changelog and the palette's "Open changelog". */
export const CHANGELOG_URL = `${REPO_URL}/releases`;

/** Where the sidebar's "View pricing" plan badge goes. Conductor's opens its pricing page; OpenConductor has no paid plans. */
export const PRICING_URL = REPO_URL;

export type HelpIcon = "keyboard" | "book" | "message" | "stethoscope";

export type HelpAction =
  | { kind: "shortcuts" }
  | { kind: "url"; url: string }
  /** Conductor's `aJ` dialog. */
  | { kind: "submitPrompt" }
  /** Conductor navigates to `/diagnostics`. */
  | { kind: "diagnostics" }
  /** Conductor invokes `open_devtools`. */
  | { kind: "devtools" };

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
  { label: "Docs", icon: "book", external: true, action: { kind: "url", url: DOCS_URL } },
  { label: "Best practices", external: true, action: { kind: "url", url: `${REPO_URL}/tree/main/docs` } },
  { label: "Changelog", external: true, action: { kind: "url", url: CHANGELOG_URL } },
  { label: "Send feedback", icon: "message", commandId: "sendFeedback", action: { kind: "url", url: FEEDBACK_URL } },
  { label: "Submit a prompt", action: { kind: "submitPrompt" } },
  { label: "Diagnostics", icon: "stethoscope", action: { kind: "diagnostics" } },
  { label: "Open debug tools", action: { kind: "devtools" } },
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
