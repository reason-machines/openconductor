// Pure rules behind the shared Settings › Agents kit (kit.tsx).

/** The redesigned page's tabs, in Sven's order: Reason, Claude Code, Codex. */
export type AgentsTab = "reason" | "claude" | "codex";

export const AGENTS_TABS: readonly AgentsTab[] = ["reason", "claude", "codex"];

export const AGENTS_TAB_LABEL: Record<AgentsTab, string> = { reason: "Reason", claude: "Claude Code", codex: "Codex" };

/** `?providerTab=` → tab; anything unknown (old `cursor`/`opencode` links included) opens the first tab. */
export function agentsTabFrom(value: string | null | undefined): AgentsTab {
  return AGENTS_TABS.find((t) => t === value) ?? AGENTS_TABS[0]!;
}

/** "••••••••" plus the key's last four characters when the backend gives them. */
export function maskedSecret(hint: string | null | undefined): string {
  return `••••••••${hint ?? ""}`;
}
