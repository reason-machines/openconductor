// Pure state selectors (no React), so node --test can cover them.
import type { AppState, Repo, Selection } from "./types";

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
  const routines = routinesSelection(pathname, search);
  if (routines) return { ...state, selection: routines };
  if (state.selection?.kind === "workspace") return state;
  return { ...state, selection: { kind: "root" } };
}

/**
 * Conductor's `/routines` routes as a selection, with its legacy `/automations` paths
 * (which redirect to them, renderApp route table): `/routines`, `/routines/new`,
 * `/routines/new/$suggestionId`, `/routines/$automationId[/fork]`. A Loop needs its
 * Reason too, so a routine's own path carries `?reason=<id>`; without it the list opens.
 */
export function routinesSelection(pathname: string, search = ""): Selection | undefined {
  const m = /^\/(?:routines|automations)(?:\/(.*?))?\/?$/.exec(pathname);
  if (!m) return undefined;
  const parts = (m[1] ?? "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: "routines" };
  if (parts[0] === "new") return { kind: "routines", page: parts[1] ? { view: "new", suggestion: parts[1] } : { view: "new" } };
  const reasonId = new URLSearchParams(search).get("reason");
  if (!reasonId) return { kind: "routines" };
  return { kind: "routines", page: { view: parts[1] === "fork" ? "fork" : "edit", reasonId, id: parts[0] } };
}
