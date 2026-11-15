// "Go to next unread" (chat.nextAttention, Cmd+Alt+L), as Conductor picks it.
//
// Conductor (renderApp-D_fmY7hW.js g1o @7,528,638 and the palette's
// "go-to-next-unread" branch @10,906,926) takes every chat sorted by Qre
// (index-BGEQ8YjU.js @1,128,168: updatedAt desc, then createdAt desc, then id),
// keeps the ones that are unread, not hidden, not the selected chat, and in a
// workspace that is not archived, and opens the first: in another workspace
// through the workspace route with that chat's tab, in the same workspace with
// navigateToSession. It never wraps and never walks sidebar order. The keyboard
// path skips the selected chat; the palette path does not.
//
// The unit is the chat (Workspace.unreadChats); a chat's time is when its row
// last changed (`sessions.updated_at`, which every update moves). Chats without
// a tab (closed or pre-restart reviews) count as hidden (state/openChat.ts).

import type { AppState, Workspace } from "./types.ts";
import type { Action } from "./store";
import { selectedChatOf } from "./autoUnread.ts";
import { chatOpenable, requestChat } from "./openChat.ts";
import { workspaceOfChat } from "./workspaceSessions.ts";

export interface NextUnreadTarget {
  repoId: string;
  workspace: Workspace;
  chatId: string;
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

/**
 * A user message at `at` is workspace activity: `updatedAt` moves forward to it,
 * never back (Conductor's setSessionUpdatedAt, index-BGEQ8YjU.js @1,066,404,
 * which also updates its cached workspace). Assistant output is not activity.
 */
export function withActivity(w: Workspace, at: number): Workspace {
  return at > (w.updatedAt ?? w.createdAt) ? { ...w, updatedAt: at } : w;
}

/** The first unread candidate in Qre order, leaving out `skipId`. */
export function pickNextUnread<T extends Candidate>(items: readonly T[], skipId?: string | null): T | undefined {
  return items.filter((c) => c.unread && c.id !== skipId).sort(byRecentUpdate)[0];
}

/**
 * The unread chat "Go to next unread" opens. `skipSelected` is the keyboard
 * path (Conductor leaves out the chat already open: `selectedChatId`, else the
 * open workspace's main chat); the palette passes false. Archived workspaces
 * and chats without a tab never count.
 */
export function nextUnreadChat(state: AppState, { skipSelected, selectedChatId }: { skipSelected: boolean; selectedChatId?: string | null }): NextUnreadTarget | undefined {
  const sel = state.selection;
  const skipId = skipSelected && sel.kind === "workspace" ? (selectedChatId && workspaceOfChat(selectedChatId) === sel.workspaceId ? selectedChatId : sel.workspaceId) : null;
  const candidates = state.repos.flatMap((r) =>
    r.workspaces
      .filter((w) => w.status !== "archived")
      .flatMap((w) =>
        (w.unreadChats ?? [])
          .filter((c) => chatOpenable(c.id))
          .map((c) => ({ id: c.id, unread: true, createdAt: c.at, updatedAt: c.at, repoId: r.id, workspace: w })),
      ),
  );
  const pick = pickNextUnread(candidates, skipId);
  return pick && { repoId: pick.repoId, workspace: pick.workspace, chatId: pick.id };
}

/**
 * Opens what "Go to next unread" picks, on its chat's tab, and marks that chat
 * read, as showing it does; false when nothing is unread. The palette,
 * Cmd+Alt+L and the composer's "Next unread" button all go through here.
 */
export function openNextUnread(state: AppState, dispatch: (action: Action) => void, opts: { skipSelected: boolean }): boolean {
  const target = nextUnreadChat(state, { ...opts, selectedChatId: selectedChatOf(state.selection.kind === "workspace" ? state.selection.workspaceId : "") });
  if (!target) return false;
  requestChat(target.chatId);
  const sel = state.selection;
  if (sel.kind !== "workspace" || sel.workspaceId !== target.workspace.id) {
    dispatch({ type: "select", selection: { kind: "workspace", repoId: target.repoId, workspaceId: target.workspace.id } });
  }
  dispatch({ type: "setChatUnread", repoId: target.repoId, workspaceId: target.workspace.id, chatId: target.chatId, unread: false, at: Date.now() });
  return true;
}
