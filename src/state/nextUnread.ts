// "Go to next unread" (chat.nextAttention, Cmd+Alt+L), as Conductor picks it.
//
// Conductor (renderApp-D_fmY7hW.js g1o @7,571,704 and the palette's
// "go-to-next-unread" branch @10,906,926) takes every chat sorted by Qre
// (index-BGEQ8YjU.js @1,128,168: updatedAt desc, then createdAt desc, then id),
// keeps the first one that is unread, not hidden, and in a workspace that is
// not archived, and opens it. It never wraps and never walks sidebar order:
// it always goes to the most recently updated unread chat. The keyboard path
// skips the chat already open; the palette path does not.
//
// Our chats carry no unread flag yet, so the unit here is the workspace's own
// unread flag (`workspaces.unread`) with the same order, filters and
// current-item rule. Once chats carry unread, feed them through `pickNextUnread`.

import type { AppState, Workspace } from "./types.ts";

export interface NextUnreadTarget {
  repoId: string;
  workspace: Workspace;
}

interface Candidate {
  id: string;
  unread?: boolean;
  createdAt: number;
  updatedAt?: number;
}

/** Conductor's Qre: newest update first, then newest creation, then id. */
export function byRecentUpdate(a: Candidate, b: Candidate): number {
  const au = a.updatedAt ?? a.createdAt;
  const bu = b.updatedAt ?? b.createdAt;
  return bu - au || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
}

/** The first unread candidate in Qre order, leaving out `skipId`. */
export function pickNextUnread<T extends Candidate>(items: readonly T[], skipId?: string | null): T | undefined {
  return items.filter((c) => c.unread && c.id !== skipId).sort(byRecentUpdate)[0];
}

/**
 * The unread workspace "Go to next unread" opens. `skipSelected` is the
 * keyboard path (Conductor leaves out the chat already open); the palette
 * passes false. Archived workspaces never count.
 */
export function nextUnreadWorkspace(state: AppState, { skipSelected }: { skipSelected: boolean }): NextUnreadTarget | undefined {
  const refs = state.repos.flatMap((r) => r.workspaces.filter((w) => w.status !== "archived").map((w) => ({ repoId: r.id, workspace: w })));
  const sel = state.selection;
  const skipId = skipSelected && sel.kind === "workspace" ? sel.workspaceId : null;
  const pick = pickNextUnread(
    refs.map((ref) => ({ ...ref, id: ref.workspace.id, unread: ref.workspace.unread, createdAt: ref.workspace.createdAt, updatedAt: ref.workspace.updatedAt })),
    skipId,
  );
  return pick && { repoId: pick.repoId, workspace: pick.workspace };
}
