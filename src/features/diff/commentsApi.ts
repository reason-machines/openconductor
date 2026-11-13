// parity:diff.comments-inline:command parity:diff.comments-to-chat:command parity:diff.comments-github:command
// Review comments through the diff_comment* Tauri commands
// (src-tauri/src/diff/comment_commands.rs). Tauri maps camelCase argument
// names to the commands' snake_case parameters; the comment object itself
// crosses as-is in DiffComment's snake_case shape.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import { migrateLocations, type DiffComment } from "./comments.ts";
import { localCommentStore, reviewCommentsChanged, type CommentStore, type GithubSyncReport } from "./commentStore.ts";

function tauriCommentStore(workspaceId: string, workspacePath: string | null): CommentStore {
  const github: Pick<CommentStore, "syncGithub" | "resolveOnGithub"> = workspacePath
    ? {
        syncGithub: () => invoke<GithubSyncReport>("diff_comments_sync_github", { workspaceId, workspacePath }),
        resolveOnGithub: async (threadId) => {
          await invoke("diff_comment_resolve_github", { workspacePath, threadId });
        },
      }
    : {};
  return {
    ...github,
    list: () => invoke<DiffComment[]>("diff_comments_list", { workspaceId }).then(migrateLocations),
    add: async (comment) => {
      await invoke("diff_comment_add", { comment });
    },
    edit: (id, body) => invoke("diff_comment_edit", { id, body }),
    updateAnchors: (updates) => invoke("diff_comments_update_anchors", { workspaceId, updates }),
    remove: async (id) => {
      await invoke("diff_comment_delete", { id });
    },
    resolve: async (threadId, resolved) => {
      await invoke("diff_comment_resolve", { threadId, resolved });
    },
    markReviewed: async (ids) => {
      await invoke("diff_comments_mark_reviewed", { workspaceId, ids });
      reviewCommentsChanged(workspaceId);
    },
    markSent: async (ids) => {
      await invoke("diff_comments_mark_sent", { ids });
    },
  };
}

/** `workspacePath` (the workspace's checkout) enables GitHub comment sync. */
export function commentStoreFor(workspaceId: string, workspacePath: string | null = null): CommentStore {
  return inTauri() ? tauriCommentStore(workspaceId, workspacePath) : localCommentStore(localStorage, workspaceId);
}
