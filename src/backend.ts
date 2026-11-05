// Thin bridge to the Rust side. Every call degrades gracefully in a plain
// browser (vite dev / preview) so the shell can be developed without Tauri.
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { FileMatch } from "./spotlight/quickOpen";
import type { GitHubOwners } from "./state/githubRepoDialog";
import type { GitProtocol, RecentRepo } from "./state/cloneDialog";
import { STEP, targetPath, type RepoScripts, type TemplateId } from "./state/createProject";
import { getAppPrefs, loadAppPrefs, setAppPref } from "./settings/appPrefs";

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
  if (!inTauri()) {
    const root = path.replace(/\/+$/, "");
    return { id: root, name: root.split("/").pop() ?? root, root, defaultBranch: "main" };
  }
  return invoke<RepositoryDto>("add_repository", { path });
}

/** Open a web page in the default browser (tauri-plugin-opener's `open_url`). */
export async function openUrl(url: string): Promise<void> {
  if (!inTauri()) {
    window.open(url, "_blank", "noopener");
    return;
  }
  await invoke("plugin:opener|open_url", { url });
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

export interface CreateProjectRequest {
  parentDir: string;
  slug: string;
  template: TemplateId;
}

export interface CreatedProject {
  path: string;
  githubUrl: string;
  originRemoteUrl: string;
  defaultBranch: string;
}

export type CreateProgress = { kind: "step"; text: string } | { kind: "line"; text: string };

/**
 * Scaffold and publish a new project (`create_new_project`). Outside Tauri it
 * plays the template's steps; a slug containing "fail" fails after the first.
 */
export async function createNewProject(
  request: CreateProjectRequest,
  onProgress: (p: CreateProgress) => void = () => {},
): Promise<CreatedProject> {
  if (!inTauri()) {
    const demo: CreateProgress[] =
      request.template === "nextjs"
        ? [{ kind: "step", text: STEP.createNext }, { kind: "line", text: "Creating a new Next.js app..." }]
        : [{ kind: "step", text: STEP.createDirectory }, { kind: "step", text: STEP.gitInit }];
    for (const p of demo) {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 200));
      if (/fail/.test(request.slug)) throw new Error("Failed to initialize Git: demo failure");
    }
    onProgress({ kind: "step", text: STEP.githubRepo });
    const path = targetPath(request.parentDir, request.slug);
    return { path, githubUrl: `https://github.com/you/${request.slug}`, originRemoteUrl: `git@github.com:you/${request.slug}.git`, defaultBranch: "main" };
  }
  const channel = new Channel<CreateProgress>();
  channel.onmessage = onProgress;
  return invoke<CreatedProject>("create_new_project", { request, onProgress: channel });
}

/** Save a repo's setup and run scripts to `<root>/.conductor/settings.local.toml`. */
export async function saveRepoScripts(repoRoot: string, scripts: RepoScripts): Promise<void> {
  if (!inTauri()) return;
  await invoke("save_repo_scripts", { repoRoot, scripts });
}

/** Native folder picker; returns null when cancelled or outside Tauri. */
export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri()) return null;
  // E2E seam: WebDriver cannot drive the native picker and Tauri locks
  // __TAURI_INTERNALS__.invoke, so tests/e2e sets the folder to "pick" here.
  const e2ePick = (window as { __OC_E2E_PICK_FOLDER__?: string }).__OC_E2E_PICK_FOLDER__;
  if (e2ePick !== undefined) return e2ePick || null;
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

// Clone dialog helpers (evidence/screens/clone-dialog.md). Outside Tauri they
// return demo data so the dialog can be tried in a browser.

const DEMO_RECENT_REPOS: RecentRepo[] = [
  { id: 1, full_name: "you/notes", description: "Personal notes and scratch work", clone_url: "https://github.com/you/notes.git", ssh_url: "git@github.com:you/notes.git", owner: { avatar_url: "" } },
  { id: 2, full_name: "acme/web", description: null, clone_url: "https://github.com/acme/web.git", ssh_url: "git@github.com:acme/web.git", owner: { avatar_url: "" } },
];

/** The 8 most recently pushed repos you can reach (`github_recent_repos`). */
export async function githubRecentRepos(): Promise<RecentRepo[]> {
  if (!inTauri()) return DEMO_RECENT_REPOS;
  return invoke<RecentRepo[]>("github_recent_repos");
}

// Sidebar add-repository menu "Recents". In a plain browser a short delay and
// demo folders stand in, so the loading row and the list can both be seen.
const DEMO_RECENT_LOCAL_REPOS = ["/Users/you/code/openconductor", "/Users/you/code/notes", "/Users/you/Developer/acme-web"];

/** Up to 8 local checkouts worked in lately, newest first (`recent_local_repositories`). */
export async function recentLocalRepositories(): Promise<string[]> {
  if (!inTauri()) return new Promise((resolve) => setTimeout(() => resolve(DEMO_RECENT_LOCAL_REPOS), 600));
  return invoke<string[]>("recent_local_repositories");
}

/** `gh config get git_protocol`, as "ssh" or "https" (`github_git_protocol`). */
export async function githubGitProtocol(): Promise<GitProtocol> {
  if (!inTauri()) return "https";
  return (await invoke<string>("github_git_protocol")) === "ssh" ? "ssh" : "https";
}

/** Where the shell kept the clone folder before it moved to conductor.db. */
const LEGACY_LAST_CLONE_DIRECTORY = "openconductor.lastCloneDirectory";

/**
 * The folder the last successful clone went into (`last_clone_directory` in the
 * settings table), or null. A value the older shell saved in localStorage moves
 * to the database the first time it is read.
 */
export async function lastCloneDirectory(): Promise<string | null> {
  const prefs = await loadAppPrefs().catch(() => getAppPrefs());
  if (prefs.last_clone_directory) return prefs.last_clone_directory;
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(LEGACY_LAST_CLONE_DIRECTORY);
  } catch {
    return null;
  }
  if (!legacy || !inTauri()) return legacy;
  await setAppPref({ key: "last_clone_directory", value: legacy })
    .then(() => localStorage.removeItem(LEGACY_LAST_CLONE_DIRECTORY))
    .catch((err) => console.warn("could not move the last clone directory", err));
  return legacy;
}

/** Remembers the clone location; a failure to save is only logged. */
export function saveLastCloneDirectory(path: string): void {
  setAppPref({ key: "last_clone_directory", value: path }).catch((err) => console.warn("could not save the last clone directory", err));
}

/** Whether `path` is an existing folder; always true outside Tauri. */
export async function folderExists(path: string): Promise<boolean> {
  if (!inTauri()) return true;
  return inspectProjectFolder(path).then((f) => f.isDir, () => false);
}

/** A favicon found in the repository at `rootPath`, as a data URL (`repo_favicon`); null outside Tauri. */
export async function repoFavicon(rootPath: string): Promise<string | null> {
  if (!inTauri()) return null;
  return invoke<string | null>("repo_favicon", { rootPath });
}

/**
 * Sidebar Rename workspace: record the new directory name (sibling symlink for a ready worktree)
 * and `workspace_name` in conductor.db (src-tauri/src/sidebar_rename_commands.rs).
 */
export async function renameWorkspaceRecord(workspaceId: string, newDirectoryName: string, workspaceName: string | null): Promise<void> {
  if (!inTauri()) return;
  await invoke("db_rename_workspace", { workspaceId, newDirectoryName, workspaceName, userSet: true });
}

/** After a branch rename the user asked for: block later automatic branch renames. */
export async function markUserSetBranchName(workspaceId: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("db_mark_user_set_branch_name", { workspaceId });
}
