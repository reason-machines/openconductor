// Thin bridge to the Rust side. Every call degrades gracefully in a plain
// browser (vite dev / preview) so the shell can be developed without Tauri.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { FileMatch } from "./spotlight/quickOpen";
import type { GitHubOwners } from "./state/githubRepoDialog";

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export const inTauri = (): boolean => isTauri();

export async function appInfo(): Promise<AppInfo> {
  if (!inTauri()) return { name: "OpenConductor", version: "0.1.0", platform: "browser" };
  return invoke<AppInfo>("app_info");
}

export interface FolderInspection {
  isDir: boolean;
  hasGit: boolean;
  origin: string | null;
}

/** Backend folder checks for Open project (`inspect_project_folder`). */
export async function inspectProjectFolder(path: string): Promise<FolderInspection> {
  return invoke<FolderInspection>("inspect_project_folder", { path });
}

export interface RepositoryDto {
  id: string;
  name: string;
  root: string;
  defaultBranch: string;
}

/** Register a local checkout with the workspace service (`add_repository`). */
export async function addRepository(path: string): Promise<RepositoryDto> {
  return invoke<RepositoryDto>("add_repository", { path });
}

// Outside Tauri these return demo data so the dialog can be tried in a browser.
/** Owners for the GitHub repo dialog (`github_repo_owners`). */
export async function githubRepoOwners(): Promise<GitHubOwners> {
  if (!inTauri()) return { owners: [{ login: "you", kind: "user" }, { login: "acme", kind: "org" }], orgsError: null };
  return invoke<GitHubOwners>("github_repo_owners");
}

/** Whether `owner/repoName` is free on GitHub (`github_repo_availability`). */
export async function githubRepoAvailability(owner: string, repoName: string): Promise<"available" | "taken"> {
  if (!inTauri()) return repoName === "taken" ? "taken" : "available";
  return invoke<"available" | "taken">("github_repo_availability", { owner, repoName });
}

export interface GitHubRepoCreateRequest {
  owner: string;
  repoPath: string;
  repositoryName: string;
  existingOriginUrl?: string;
}

/** Publish a folder as a new private repo (`github_repo_create`). */
export async function githubRepoCreate(request: GitHubRepoCreateRequest): Promise<{ githubUrl: string; originRemoteUrl: string }> {
  if (!inTauri()) throw new Error("creating a repo needs the desktop app");
  return invoke("github_repo_create", { request });
}

/** Native folder picker; returns null when cancelled or outside Tauri. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title });
  return typeof picked === "string" ? picked : null;
}

// Shown by quick open in a plain browser (vite dev / preview) so the dialog can
// be tried without the Rust side.
const DEMO_FILES = [
  "README.md", "package.json", "index.html", "src/App.tsx", "src/main.tsx", "src/backend.ts", "src/styles.css",
  "src/components/Sidebar.tsx", "src/components/WorkspaceView.tsx", "src/components/QuickOpenDialog.tsx",
  "src/spotlight/quickOpen.ts", "src/spotlight/rank.ts", "src/state/store.ts", "src-tauri/src/lib.rs",
  "src-tauri/src/quick_open/mod.rs", "src-tauri/Cargo.toml",
];

function demoMatch(query: string, root: string): FileMatch[] {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const out: FileMatch[] = [];
  for (const rel of DEMO_FILES) {
    const idx: number[] = [];
    let j = 0;
    for (let i = 0; i < rel.length && j < q.length; i++) if (rel[i].toLowerCase() === q[j]) (idx.push(i), j++);
    if (j < q.length) continue;
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    out.push({ file: { name, path: `${root}/${rel}`, is_directory: false }, score: q ? 1000 - rel.length : 0, match_indices: idx, relative_path: rel });
  }
  return q ? out.sort((a, b) => b.score - a.score) : out;
}

/** Ranked files in `workspacePath` (Rust `fuzzy_filter_files`); demo list outside Tauri. */
export async function fuzzyFilterFiles(workspacePath: string, query: string, excludeDirectories: boolean): Promise<FileMatch[]> {
  if (!inTauri()) return demoMatch(query, workspacePath);
  return invoke<FileMatch[]>("fuzzy_filter_files", { workspacePath, query, excludeDirectories });
}
