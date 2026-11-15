// Draft attachments over Tauri IPC (src-tauri/src/draft_attachments.rs).
import { invoke } from "@tauri-apps/api/core";
import { draftAttachments } from "./staging.ts";

export { ATTACHMENTS_DIR, STAGING_DIR_NAME, isStagedRelativePath } from "./staging.ts";
export type { DraftAttachments, MaterializeReport, MaterializedAttachment, StagedLocation } from "./staging.ts";

export const draftAttachmentsApi = draftAttachments(invoke);
