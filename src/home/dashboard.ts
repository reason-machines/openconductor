// Conductor's /dashboard route (`J7a`, component `lta`, decoded
// renderApp-D_fmY7hW.js @11,520,499; screen @9,906,285): a board of the
// non-archived workspaces in five status columns, gated by the Experimental
// setting `dashboard_enabled` (index-BGEQ8YjU.js `mzt` @407,004, default
// "false" in `_z`). Extracted code is read as data; this is the board's logic
// without React, so node --test covers it. Evidence: evidence/screens/dashboard.md.

import type { Repo, Workspace } from "../state/types.ts";
import { WORKSPACE_STATUSES, effectiveStatus, type WorkspaceStatusValue } from "../state/workspaceStatus.ts";
import { shortRelativeTime } from "./allWorkspaces.ts";

/** `fJn = 10`: a column shows this many cards until "Show N more". */
export const COLUMN_PAGE = 10;
/** `dJn = 5`: project tabs before the rest move under "More". */
export const VISIBLE_PROJECT_TABS = 5;

export interface BoardCard {
  repoId: string;
  workspace: Workspace;
  status: WorkspaceStatusValue;
}

/** A drag that is still being saved: the card shows in its new column meanwhile (`_ta`'s `c`). */
export interface PendingMove {
  workspaceId: string;
  status: WorkspaceStatusValue;
}

export type Board = Record<WorkspaceStatusValue, BoardCard[]>;

/** `lastUserMessageAt ?? createdAt`; our closest field to the last user message is `updatedAt`. */
export const lastActive = (w: Workspace): number => w.updatedAt ?? w.createdAt;

const archived = (w: Workspace) => w.status === "archived" || w.state === "archived";

/**
 * The cards: every workspace that is not archived (`A8t` / `yI`), narrowed to
 * the `?repo=` project when one is given (filtered by the raw value, as `lta`
 * does, so an unknown id shows nothing), newest activity first (`uta`).
 */
export function boardCards(repos: readonly Repo[], repoParam: string | undefined): BoardCard[] {
  return repos
    .filter((r) => !repoParam || r.id === repoParam)
    .flatMap((r) => r.workspaces.filter((w) => !archived(w)).map((w) => ({ repoId: r.id, workspace: w, status: effectiveStatus(w) })))
    .sort((a, b) => lastActive(b.workspace) - lastActive(a.workspace));
}

/** Cards by column, with a pending move applied where it differs from the stored status. */
export function groupBoard(cards: readonly BoardCard[], pending?: PendingMove): Board {
  const board = Object.fromEntries(WORKSPACE_STATUSES.map((s) => [s, [] as BoardCard[]])) as Board;
  for (const c of cards) {
    const status = pending && pending.workspaceId === c.workspace.id ? pending.status : c.status;
    board[status].push(status === c.status ? c : { ...c, status });
  }
  return board;
}

/** Whether a pending move is still needed: dropped once the stored status catches up (`g` in `_ta`). */
export function livePending(cards: readonly BoardCard[], pending: PendingMove | undefined): PendingMove | undefined {
  if (!pending) return undefined;
  const card = cards.find((c) => c.workspace.id === pending.workspaceId);
  return card && card.status !== pending.status ? pending : undefined;
}

/** What a drop does: nothing when it lands in the column the card already shows in. */
export function dropTarget(card: BoardCard | undefined, pending: PendingMove | undefined, to: string): WorkspaceStatusValue | undefined {
  const status = WORKSPACE_STATUSES.find((s) => s === to);
  if (!card || !status) return undefined;
  const shown = pending?.workspaceId === card.workspace.id ? pending.status : card.status;
  return shown === status ? undefined : status;
}

/** A column's visible cards and how many "Show N more" hides. */
export function columnPage<T>(cards: readonly T[], expanded: boolean): { shown: readonly T[]; hidden: number } {
  const shown = expanded || cards.length <= COLUMN_PAGE ? cards : cards.slice(0, COLUMN_PAGE);
  return { shown, hidden: cards.length - shown.length };
}

/**
 * The selected project tab (`K` in `lta`): the `?repo=` project when it is
 * listed, nothing for an unknown one, and the only project when there is one.
 */
export function selectedProject(repos: readonly Pick<Repo, "id">[], repoParam: string | undefined): string | undefined {
  if (repoParam) return repos.some((r) => r.id === repoParam) ? repoParam : undefined;
  return repos.length === 1 ? repos[0].id : undefined;
}

/** `dta`: tabs show with more than one project; the first five get tabs, the rest go under "More". */
export function projectTabs<R extends Pick<Repo, "id" | "name">>(repos: readonly R[], selected: string | undefined) {
  const tabs = repos.slice(0, VISIBLE_PROJECT_TABS);
  const more = repos.slice(VISIBLE_PROJECT_TABS);
  const moreActive = more.find((r) => r.id === selected);
  return { show: repos.length > 1, tabs, more, moreActive: moreActive !== undefined, moreLabel: moreActive?.name ?? "More" };
}

/**
 * The card footer's time (`SS`): date-fns `formatDistance` with a suffix,
 * shortened ("5m ago", "about 3 hours ago" -> "3h ago", under 30 s "just now").
 */
export function agoTime(at: number, now: number = Date.now()): string {
  const short = shortRelativeTime(at, now);
  return short === "now" ? "just now" : `${short} ago`;
}

/** The footer's PR link and time show only with a pull request or changed files (`d_i`). */
export const showsPrRow = (w: Pick<Workspace, "pr" | "diff">): boolean => Boolean(w.pr) || w.diff.added + w.diff.removed > 0;

/** `https://github.com/<owner>/<repo>/pull/<n>` from an https or ssh GitHub remote. */
export function pullRequestUrl(remote: string | undefined, number: number): string | undefined {
  const m = remote?.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `https://github.com/${m[1]}/${m[2]}/pull/${number}` : undefined;
}

/** `/dashboard?repo=<id>`: the start URL for the board, and what a project tab writes. */
export function dashboardPath(repo: string | undefined): string {
  return repo ? `/dashboard?repo=${encodeURIComponent(repo)}` : "/dashboard";
}

/** The `repo` search value of a `/dashboard` URL (`Ekr` validates it as an optional string). */
export function dashboardRepoParam(search: string): string | undefined {
  return new URLSearchParams(search).get("repo") || undefined;
}
