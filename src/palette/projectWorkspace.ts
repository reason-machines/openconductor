import type { Repo, Workspace } from "../state/types.ts";

export function preferredProjectWorkspace(repo: Pick<Repo, "workspaces">, recentIds: readonly string[]): Workspace | undefined {
  for (const id of recentIds) {
    const recent = repo.workspaces.find((workspace) => workspace.id === id);
    if (recent) return recent;
  }
  return [...repo.workspaces].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))[0];
}
