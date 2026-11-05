// parity:diff.comments-inline:data
// Where a workspace's review comments live. In the app they go through the
// diff_comment* Tauri commands into conductor.db (commentsApi.ts); in a plain
// browser they are kept in localStorage with the same semantics, so the UI can
// be developed and checked without Tauri.
import { deleteComment, editComment, markSent, setThreadResolved, type DiffComment } from "./comments.ts";

export interface CommentStore {
  list(): Promise<DiffComment[]>;
  add(c: DiffComment): Promise<void>;
  edit(id: string, body: string): Promise<void>;
  remove(id: string): Promise<void>;
  /** Resolve or reopen the thread with this key (see `threadKey`). */
  resolve(threadId: string, resolved: boolean): Promise<void>;
  markSent(ids: string[]): Promise<void>;
  /** Pull the workspace PR's comments from GitHub into the store (app only). */
  syncGithub?(): Promise<GithubSyncReport>;
  /** Resolve a GitHub review thread on GitHub, then here (app only). */
  resolveOnGithub?(threadId: string): Promise<void>;
}

/** `diff_comments_sync_github`'s result. */
export interface GithubSyncReport {
  pr_number: number | null;
  /** Why nothing was synced: no PR, a merged PR, or gh could not reach GitHub. */
  skipped: string | null;
  review_comments: number;
  general_comments: number | null;
  changed: number;
}

type KV = Pick<Storage, "getItem" | "setItem">;

export const localKey = (workspaceId: string) => `openconductor.diff.comments.${workspaceId}`;

export function localCommentStore(storage: KV, workspaceId: string, now: () => number = Date.now): CommentStore {
  const read = (): DiffComment[] => {
    try {
      const v: unknown = JSON.parse(storage.getItem(localKey(workspaceId)) ?? "[]");
      return Array.isArray(v) ? (v as DiffComment[]) : [];
    } catch {
      return [];
    }
  };
  const write = (f: (cs: DiffComment[]) => DiffComment[]) => {
    storage.setItem(localKey(workspaceId), JSON.stringify(f(read())));
    return Promise.resolve();
  };
  return {
    list: () => Promise.resolve(read()),
    add: (c) => {
      if (!c.body.trim()) return Promise.reject(new Error("comment is empty"));
      return write((cs) => [...cs, { ...c, created_at: now() }]);
    },
    edit: (id, body) => (body.trim() ? write((cs) => editComment(cs, id, body, now())) : Promise.reject(new Error("comment is empty"))),
    remove: (id) => write((cs) => deleteComment(cs, id)),
    resolve: (threadId, resolved) => write((cs) => setThreadResolved(cs, threadId, resolved, now())),
    markSent: (ids) => write((cs) => markSent(cs, new Set(ids), now())),
  };
}
