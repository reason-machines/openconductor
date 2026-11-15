// parity:palette.pr-actions — wires palette PR commands (linkIssue, createPR, mergePR, markPrReady,
// fixErrors) to the WorkspaceView that owns them. Same module-level pub/sub as gitPanelActions.ts.

export type PrPaletteAction =
  | "linkIssue"
  | "createPullRequest"
  | "mergePullRequest"
  | "markPrReady"
  | "fixErrors";

const requests = new Map<string, PrPaletteAction>();
const listeners = new Set<(repoId: string, workspaceId: string) => void>();

function key(repoId: string, workspaceId: string): string {
  return JSON.stringify([repoId, workspaceId]);
}

export function requestPrPaletteAction(repoId: string, workspaceId: string, action: PrPaletteAction): void {
  requests.set(key(repoId, workspaceId), action);
  for (const listener of listeners) listener(repoId, workspaceId);
}

export function takePrPaletteRequest(repoId: string, workspaceId: string): PrPaletteAction | undefined {
  const k = key(repoId, workspaceId);
  const req = requests.get(k);
  requests.delete(k);
  return req;
}

export function onPrPaletteRequest(listener: (repoId: string, workspaceId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
