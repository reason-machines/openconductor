// Opening a workspace link: openconductor://workspace?id=<id>[&session=<id>],
// the link Copy link puts on the clipboard (src/workspace/link.ts, PR #400; REA:
// Conductor's `$$` builds `${scheme}://workspace?id=<localId>`). macOS hands the
// URL to tauri-plugin-deep-link, which the app reads with getCurrent (a link that
// launched the app) and onOpenUrl (links while it runs); see useWorkspaceDeepLinks.
// Pure so node --test can cover it.
import type { Action } from "../state/store";
import type { AppState } from "../state/types";

export const APP_URL_SCHEME = "openconductor";

export interface WorkspaceLink {
  workspaceId: string;
  sessionId?: string;
}

/** The workspace a link points at, or null for any other URL. */
export function parseWorkspaceLink(raw: string): WorkspaceLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Non-special schemes put `workspace` in the host (`//workspace`); accept the
  // path form (`openconductor:workspace?…`) too.
  const target = url.host || url.pathname.replace(/^\/+/, "");
  if (url.protocol !== `${APP_URL_SCHEME}:` || target !== "workspace") return null;
  const workspaceId = url.searchParams.get("id");
  if (!workspaceId) return null;
  const sessionId = url.searchParams.get("session");
  return sessionId ? { workspaceId, sessionId } : { workspaceId };
}

/**
 * What selecting the linked workspace dispatches, as clicking its sidebar row
 * does (select, then clear unread); null while no repository holds it.
 */
export function openWorkspaceLinkActions(state: AppState, link: WorkspaceLink): Action[] | null {
  for (const repo of state.repos) {
    const ws = repo.workspaces.find((w) => w.id === link.workspaceId);
    if (!ws) continue;
    const actions: Action[] = [{ type: "select", selection: { kind: "workspace", repoId: repo.id, workspaceId: ws.id } }];
    if (ws.unread) actions.push({ type: "setWorkspaceUnread", repoId: repo.id, workspaceId: ws.id, unread: false });
    return actions;
  }
  return null;
}

/** The last workspace link among the URLs the OS handed over, if any. */
export function lastWorkspaceLink(urls: readonly string[] | null | undefined): WorkspaceLink | null {
  let found: WorkspaceLink | null = null;
  for (const url of urls ?? []) found = parseWorkspaceLink(url) ?? found;
  return found;
}
