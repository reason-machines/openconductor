// Pure state selectors (no React), so node --test can cover them.
import type { AppState, Repo } from "./types";

/** Saved state from before the flag existed has no value, which means shown. */
export const isSidebarVisible = (state: AppState): boolean => state.sidebarVisible !== false;

/** Workspaces that are not archived, across all repositories (decides Home's card spacing). */
export function activeWorkspaceCount(repos: Repo[]): number {
  return repos.reduce((n, r) => n + r.workspaces.filter((w) => w.status !== "archived").length, 0);
}
