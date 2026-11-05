// parity:diff.comments-inline:command parity:diff.comments-to-chat:command
// Review comments through the diff_comment* Tauri commands
// (src-tauri/src/diff/comment_commands.rs). Tauri maps camelCase argument
// names to the commands' snake_case parameters; the comment object itself
// crosses as-is in DiffComment's snake_case shape.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../../backend";
import type { DiffComment } from "./comments.ts";
import { localCommentStore, type CommentStore } from "./commentStore.ts";

function tauriCommentStore(workspaceId: string): CommentStore {
  return {
    list: () => invoke<DiffComment[]>("diff_comments_list", { workspaceId }),
    add: async (comment) => {
      await invoke("diff_comment_add", { comment });
    },
    edit: (id, body) => invoke("diff_comment_edit", { id, body }),
    remove: async (id) => {
      await invoke("diff_comment_delete", { id });
    },
    resolve: async (threadId, resolved) => {
      await invoke("diff_comment_resolve", { threadId, resolved });
    },
    markSent: async (ids) => {
      await invoke("diff_comments_mark_sent", { ids });
    },
  };
}

export function commentStoreFor(workspaceId: string): CommentStore {
  return inTauri() ? tauriCommentStore(workspaceId) : localCommentStore(localStorage, workspaceId);
}
