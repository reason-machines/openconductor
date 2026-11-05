// Pure logic for the "Create from..." picker (PR, branch, issue): tab order,
// search, pasted references and the status line shown in place of results.
// Evidence: evidence/create-workspace/README.md.

import type { CreateFrom } from "./createFlow.ts";

export type FromTab = "pr" | "branch" | "issue";
export const FROM_TABS: readonly FromTab[] = ["pr", "branch", "issue"];
export const TAB_LABEL: Record<FromTab, string> = { pr: "Pull requests", branch: "Branches", issue: "Issues" };

/** Tab moves right, Shift+Tab left, wrapping. */
export function nextTab(tab: FromTab, back = false): FromTab {
  const i = FROM_TABS.indexOf(tab);
  return FROM_TABS[(i + (back ? FROM_TABS.length - 1 : 1)) % FROM_TABS.length];
}

/** Why a source has no list: no GitHub remote, or the integration is not set up. */
export type Unavailable = "no_remote" | "no_github" | "no_linear";

export type SourceState<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; reason: Unavailable }
  | { status: "ready"; items: T[] };

export interface BranchItem { name: string; remote: string | null }

/** Plain words match title, number, branch, key or body; `#12` or `12` matches the number. */
export function matches(from: CreateFrom, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const num = /^#?(\d+)$/.exec(q)?.[1];
  if (from.kind === "pr") {
    if (num) return String(from.number).startsWith(num);
    return [from.title, from.headBranch].some((s) => s.toLowerCase().includes(q));
  }
  if (from.kind === "branch") return from.name.toLowerCase().includes(q);
  if (num && from.provider === "github") return from.key.replace(/^#/, "").startsWith(num);
  return [from.key, from.title, from.body ?? ""].some((s) => s.toLowerCase().includes(q));
}

/** A remote-tracking branch is checked out under its local name (`origin/foo` -> `foo`). */
export function localBranchName(b: BranchItem): string {
  return b.remote && b.name.startsWith(`${b.remote}/`) ? b.name.slice(b.remote.length + 1) : b.name;
}

export function branchToFrom(b: BranchItem): CreateFrom {
  return { kind: "branch", name: localBranchName(b) };
}

/** Local and remote copies of one branch show once, local first. */
export function dedupeBranches(list: BranchItem[]): BranchItem[] {
  const seen = new Set<string>();
  return list.filter((b) => {
    const local = localBranchName(b);
    if (seen.has(local)) return false;
    seen.add(local);
    return true;
  });
}

export type ParsedRef =
  | { kind: "pr"; number: number }
  | { kind: "issue"; provider: "github"; number: number }
  | { kind: "issue"; provider: "linear"; key: string };

/** Recognises a pasted GitHub PR / issue URL or a Linear key / URL. */
export function parseRef(input: string): ParsedRef | null {
  const s = input.trim();
  const gh = /^https?:\/\/github\.com\/[^/]+\/[^/]+\/(pull|issues)\/(\d+)/i.exec(s);
  if (gh) return gh[1].toLowerCase() === "pull" ? { kind: "pr", number: Number(gh[2]) } : { kind: "issue", provider: "github", number: Number(gh[2]) };
  const linear = /^(?:https?:\/\/linear\.app\/[^/]+\/issue\/)?([A-Za-z][A-Za-z0-9]{0,9}-\d+)\b/.exec(s);
  if (linear) return { kind: "issue", provider: "linear", key: linear[1].toUpperCase() };
  return null;
}

export const COULD_NOT_LOAD_PR = "Could not load that pull request";
export const LINEAR_ISSUE_NOT_FOUND = "Linear issue not found";

const WORDS: Record<FromTab, { loading: string; searching: string; empty: string; noun: string }> = {
  pr: { loading: "Loading pull requests...", searching: "Searching pull requests...", empty: "No pull requests found", noun: "pull requests" },
  branch: { loading: "Loading branches...", searching: "Loading branches...", empty: "No branches found", noun: "branches" },
  issue: { loading: "Loading your issues...", searching: "Searching issues...", empty: "No issues found", noun: "GitHub issues" },
};

/** The line shown instead of results, or null when there are results to show. */
export function statusLine(tab: FromTab, state: SourceState<unknown>, shown: number, query: string): string | null {
  const w = WORDS[tab];
  switch (state.status) {
    case "loading":
      return query.trim() ? w.searching : w.loading;
    case "error":
      return tab === "branch" ? "Couldn't load branches." : state.message;
    case "unavailable":
      if (state.reason === "no_linear") return "Linear integration required";
      return state.reason === "no_remote" ? `Add a GitHub repository remote to include ${w.noun}` : `Set up GitHub in settings to include ${w.noun}`;
    case "ready":
      return shown === 0 ? w.empty : null;
  }
}

/** Short label for the chosen item, shown on the picker button. */
export function fromLabel(from: CreateFrom): string {
  if (from.kind === "pr") return `PR #${from.number} ${from.title}`;
  if (from.kind === "branch") return from.name;
  return `${from.key} ${from.title}`;
}
