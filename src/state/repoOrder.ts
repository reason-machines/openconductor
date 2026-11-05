// Manual repository order and hidden repositories in the sidebar.
// Conductor v0.87.6 (renderApp-D_fmY7hW.js, repo list @10042864): the list is
// one drag-and-drop column, dragging is off with a single visible repo, a drop
// moves the dragged id to the target's place in the full id list (hidden ones
// included) and persists that whole order; hidden repos are listed only while
// "show hidden" is on, and that toggle appears only when some repo is hidden.
import type { Repo } from "./types";

/** `ids` with `sourceId` moved to `targetId`'s position; unchanged when either is missing or they are equal. */
export function moveRepo(ids: readonly string[], sourceId: string, targetId: string): string[] {
  const next = [...ids];
  const from = next.indexOf(sourceId);
  const to = next.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** `repos` in the order of `ids`; repos missing from `ids` keep their relative order at the end. */
export function orderRepos(repos: readonly Repo[], ids: readonly string[]): Repo[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return repos
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (rank.get(a.r.id) ?? ids.length + a.i) - (rank.get(b.r.id) ?? ids.length + b.i))
    .map(({ r }) => r);
}

/** Repos the sidebar lists: hidden ones only while `showHidden` is on. */
export function visibleRepos(repos: readonly Repo[], showHidden: boolean): Repo[] {
  return repos.filter((r) => showHidden || !r.hidden);
}

export function hasHiddenRepos(repos: readonly Repo[]): boolean {
  return repos.some((r) => r.hidden);
}

export function setRepoHidden(repos: readonly Repo[], repoId: string, hidden: boolean): Repo[] {
  return repos.map((r) => (r.id === repoId ? { ...r, hidden: hidden || undefined } : r));
}
