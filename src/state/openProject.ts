// Home "Open project": decide what happens to a folder picked in the native
// picker, from the backend's folder checks (evidence/screens/home.md).

import type { Action } from "./store.ts";

export interface FolderInspection {
  isDir: boolean;
  hasGit: boolean;
  origin: string | null;
}

export type OpenProjectOutcome =
  | { kind: "add"; name: string; path: string; remote: string }
  | { kind: "needsGitHubRepo"; name: string; path: string; needsGitInit: boolean }
  | { kind: "error"; message: string };

/** Last path segment, or "untitled" for a root or empty path. */
export function projectName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "untitled";
}

/**
 * No `.git`: offer to initialise git and create a GitHub repo. No origin: offer to
 * create the GitHub repo. Otherwise add the local folder as a `file://` remote.
 */
export function decideOpenProject(path: string, f: FolderInspection): OpenProjectOutcome {
  const name = projectName(path);
  if (!f.isDir) return { kind: "error", message: `${path} is not a folder` };
  if (!f.hasGit) return { kind: "needsGitHubRepo", name, path, needsGitInit: true };
  if (!f.origin) return { kind: "needsGitHubRepo", name, path, needsGitInit: false };
  return { kind: "add", name, path, remote: `file://${path}` };
}

export function failedToAddMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `Failed to add project: ${detail}`;
}

/** What `add_repository` returns for a registered project. */
export interface RegisteredRepo {
  id: string;
  name: string;
  root: string;
  defaultBranch: string;
}

/**
 * The store action for a project the backend just registered, under the
 * backend's id and name. Conductor's `g2t` names a local project
 * `makeRepoNameUnique(<folder name>, null)`, so opening an added folder again
 * gives a second project `<name>-v1` (evidence/screens/duplicate-repo.md);
 * the folder name alone would show it unbumped.
 */
export function addRegisteredRepo(registered: RegisteredRepo, remote: string): Action {
  return {
    type: "addRepo",
    id: registered.id,
    repo: { name: registered.name, path: registered.root, remote, defaultBranch: registered.defaultBranch },
  };
}
