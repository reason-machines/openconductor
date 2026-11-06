import type { Repo } from "../../state/types.ts";

export interface LinkedDirectoryRow {
  id: string;
  path: string;
  label: string;
  directoryName: string;
  branch: string;
}

export interface LinkedDirectoryGroup {
  id: string;
  name: string;
  workspaces: LinkedDirectoryRow[];
}

export function localDirectoryPath(value: string): string | null {
  if (!value.startsWith("/") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const path = value.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  return path;
}

export function directoryExcluded(path: string, excludedPaths: readonly string[]): boolean {
  return excludedPaths.some((excluded) => localDirectoryPath(excluded) === path);
}

export function linkedDirectoryGroups({ repos, repositoryId, query, excludedPaths = [] }: {
  repos: readonly Repo[];
  repositoryId: string;
  query: string;
  excludedPaths?: readonly string[];
}): LinkedDirectoryGroup[] {
  const needle = query.toLowerCase();
  const groups: LinkedDirectoryGroup[] = [];
  for (const repo of repos) {
    if (repo.id === repositoryId) continue;
    const workspaces: LinkedDirectoryRow[] = [];
    for (const workspace of repo.workspaces) {
      const path = workspace.path ? localDirectoryPath(workspace.path) : null;
      if (workspace.status === "archived" || !path || directoryExcluded(path, excludedPaths)) continue;
      const directoryName = workspace.directoryName ?? workspace.name;
      if (query.trim() && ![directoryName, workspace.branch, repo.name].some((text) => text.toLowerCase().includes(needle))) continue;
      workspaces.push({ id: workspace.id, path, label: workspace.workspaceName || workspace.prTitle || workspace.branch || workspace.name, directoryName, branch: workspace.branch });
    }
    if (workspaces.length) groups.push({ id: repo.id, name: repo.name, workspaces });
  }
  return groups;
}
