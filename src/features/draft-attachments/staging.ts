// Draft attachment staging (Conductor's draft-attachments/ store), bound to an
// injected invoke so it can be tested without Tauri. The store itself is
// src-tauri/src/draft_attachments.rs; api.ts wires it to the real IPC.

/** Workspace-relative attachments directory (Conductor `Iv`). */
export const ATTACHMENTS_DIR = ".context/attachments";
/** Directory under the app data dir holding staged drafts (Conductor `hvt`). */
export const STAGING_DIR_NAME = "draft-attachments";

export type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface StagedLocation {
  storedPath: string;
}

export interface MaterializedAttachment {
  relativePath: string;
  /** Null when the file was copied into the workspace. */
  error: string | null;
}

export interface MaterializeReport {
  attachments: MaterializedAttachment[];
  /** The staging directory was removed (every copy succeeded). */
  stagingRemoved: boolean;
}

/** Whether `relativePath` can be staged: it must be below `.context/attachments/`. */
export function isStagedRelativePath(relativePath: string): boolean {
  return relativePath.startsWith(`${ATTACHMENTS_DIR}/`);
}

export function draftAttachments(invoke: Invoke) {
  return {
    /** Conductor `writeDraftAttachment`: stage bytes for a workspace that is not ready yet. */
    write: (args: { draftWorkspaceId: string; relativePath: string; data: Uint8Array }) =>
      invoke<StagedLocation>("draft_attachment_write", { ...args, data: Array.from(args.data) }),
    /** Conductor `resolveStagedAttachmentLocation`. */
    resolve: (args: { localWorkspaceId: string; relativePath: string }) =>
      invoke<StagedLocation>("draft_attachment_resolve", args),
    /** Conductor `removeStagedAttachment`; resolves to whether a file was removed. */
    remove: (args: { localWorkspaceId: string; relativePath: string }) =>
      invoke<boolean>("draft_attachment_remove", args),
    /** Conductor `uploadStagedAttachmentToWorkspace`; resolves to the destination path. */
    uploadToWorkspace: (args: { localWorkspaceId: string; relativePath: string; workspacePath: string }) =>
      invoke<string>("draft_attachment_upload", args),
    /** Conductor `materializeDraftAttachments`, once the workspace is ready. */
    materialize: (args: { localWorkspaceId: string; workspacePath: string }) =>
      invoke<MaterializeReport>("draft_attachments_materialize", args),
    /** Conductor `materialize_local_path_attachment` for a local workspace. */
    materializeLocalPath: (args: { sourcePath: string; destinationPath: string }) =>
      invoke<void>("materialize_local_path_attachment", args),
  };
}

export type DraftAttachments = ReturnType<typeof draftAttachments>;
