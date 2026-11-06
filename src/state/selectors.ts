// Pure state selectors (no React), so node --test can cover them.
import type { AppState, Repo } from "./types";

/** Saved state from before the flag existed has no value, which means shown. */
export const isSidebarVisible = (state: AppState): boolean => state.sidebarVisible !== false;

/** Workspaces that are not archived, across all repositories (decides Home's card spacing). */
export function activeWorkspaceCount(repos: Repo[]): number {
  return repos.reduce((n, r) => n + r.workspaces.filter((w) => w.status !== "archived").length, 0);
}

/** Ids of workspaces in `prev` that `next` no longer has (archived, or their repository removed). */
export function removedWorkspaceIds(prev: AppState, next: AppState): string[] {
  const kept = new Set(next.repos.flatMap((r) => r.workspaces.map((w) => w.id)));
  return prev.repos.flatMap((r) => r.workspaces.map((w) => w.id)).filter((id) => !kept.has(id));
}

/**
 * Where the app opens: `/all-workspaces` opens the Home list and
 * `/dashboard[?repo=<id>]` the dashboard board (which goes back to `/` when
 * the setting is off), otherwise a saved open workspace is restored and
 * anything else starts at `/` (the entry cards).
 */
export function startSelection(state: AppState, pathname: string, search = ""): AppState {
  if (pathname === "/all-workspaces") return { ...state, selection: { kind: "home" } };
  if (pathname === "/dashboard") {
    const repo = new URLSearchParams(search).get("repo") || undefined;
    return { ...state, selection: repo ? { kind: "dashboard", repo } : { kind: "dashboard" } };
  }
  if (state.selection?.kind === "workspace") return state;
  return { ...state, selection: { kind: "root" } };
}
