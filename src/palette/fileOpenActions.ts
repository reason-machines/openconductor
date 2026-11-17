// parity:files.open:nav — routes QuickOpen and SearchInFiles dialog selections to WorkspaceFileView.
// Same module-level pub/sub pattern as gitPanelActions.ts.

export interface FileOpenRequest {
  path: string;
  /** Line number to scroll to (1-based); absent for a plain file open. */
  line?: number;
  /** "diff" shows the file's git changes; "file" (default) opens the file text viewer. */
  mode?: "diff" | "file";
}

const requests = new Map<string, FileOpenRequest>();
const listeners = new Set<(repoId: string, workspaceId: string) => void>();

function key(repoId: string, workspaceId: string): string {
  return JSON.stringify([repoId, workspaceId]);
}

export function requestFileOpen(repoId: string, workspaceId: string, req: FileOpenRequest): void {
  requests.set(key(repoId, workspaceId), req);
  for (const listener of listeners) listener(repoId, workspaceId);
}

export function takeFileOpenRequest(repoId: string, workspaceId: string): FileOpenRequest | undefined {
  const k = key(repoId, workspaceId);
  const req = requests.get(k);
  requests.delete(k);
  return req;
}

export function onFileOpenRequest(listener: (repoId: string, workspaceId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
