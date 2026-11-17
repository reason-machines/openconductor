import { archived } from "./data";
export { onArchiveEvent } from "../../src/workspace/archiveModel";
export type { ArchivedWorkspace } from "../../src/workspace/archivedList";
export async function listArchivedWorkspaces() { return archived; }
