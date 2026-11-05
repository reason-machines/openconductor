// Bridge to the workspace lifecycle commands (src-tauri/src/workspace/commands.rs).
// Outside Tauri (vite dev, screenshots) each call has a local stand-in so the
// Create-workspace dialog still runs end to end.
import { Channel, invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { CreateFrom, CreateWorkspaceArgs } from "./createFlow";
import { issueToFrom, listErrorState, prToFrom, type OpenIssueDto, type OpenPrDto, type SourceState } from "./createFrom";
import type { BranchPrefixInfo } from "./naming";
import { UPSTREAM_WARNING } from "./upstream";

export interface RepositoryDto {
  id: string;
  name: string;
  root: string;
  defaultBranch: string;
}

export interface BranchDto {
  name: string;
  remote: string | null;
  commit: string;
  isHead: boolean;
  committedAt: number;
}

export interface CreatedWorkspaceDto {
  workspace: { id: string; repositoryId: string; directoryName: string; path: string; branchName: string; state: string; head: string | null };
  baseRef: string;
  baseCommit: string;
  fetched: boolean;
  copiedFiles: string[];
  /** Set when "Set upstream on plain git push" could not be applied to the new workspace. */
  upstreamWarning: string | null;
}


/** Registers a local checkout with the backend (idempotent) and returns its backend id. */
export async function ensureRepository(path: string): Promise<RepositoryDto> {
  if (!inTauri()) return { id: path || "browser-repo", name: path, root: path, defaultBranch: "main" };
  return invoke<RepositoryDto>("add_repository", { path });
}

/**
 * Clones `url` into `<parentDir>/<name>` (the backend suffixes `-2`, `-3`, ...
 * when taken) and registers it like add_repository. Each progress line goes
 * to `onProgress` as it arrives. The browser stand-in waits briefly, emits a
 * few lines and returns a fake checkout; `fail-` URLs reject with the
 * backend's exit-code message so the error state can be tried without the
 * desktop app.
 */
export async function cloneRepository(
  url: string,
  parentDir: string,
  name: string,
  onProgress: (line: string) => void = () => {},
): Promise<RepositoryDto> {
  if (!inTauri()) {
    for (const line of ["Creating directory structure...", "Cloning repository...", `Cloning into '${name}'...`]) {
      onProgress(line);
      await new Promise((r) => setTimeout(r, 200));
    }
    if (/fail-/.test(url)) {
      throw new Error("Git clone failed with code 128\n\nSTDOUT:\n\n\nSTDERR:\nfatal: repository not found");
    }
    const root = `${parentDir.replace(/\/+$/, "")}/${name}`;
    return { id: root, name, root, defaultBranch: "main" };
  }
  const channel = new Channel<string>();
  channel.onmessage = onProgress;
  return invoke<RepositoryDto>("clone_repository", { url, parentDir, onProgress: channel });
}

/** Folder the clone dialog falls back to when no saved location exists. */
export async function defaultCloneDirectory(): Promise<string> {
  if (!inTauri()) return "~/openconductor/repos";
  return invoke<string>("default_clone_directory");
}

/** Local branches first, newest first. The browser stand-in lists only the default branch. */
export async function listBranches(repoId: string, defaultBranch: string): Promise<BranchDto[]> {
  if (!inTauri()) return [{ name: defaultBranch, remote: null, commit: "", isHead: true, committedAt: 0 }];
  return invoke<BranchDto[]>("list_branches", { repoId });
}

export async function createWorkspace(args: CreateWorkspaceArgs): Promise<CreatedWorkspaceDto> {
  if (!inTauri()) {
    await new Promise((r) => setTimeout(r, 400));
    const path = `~/openconductor/workspaces/${args.directoryName}`;
    return {
      workspace: { id: `${args.repositoryId}/${args.directoryName}`, repositoryId: args.repositoryId, directoryName: args.directoryName, path, branchName: args.branchName, state: "active", head: null },
      baseRef: args.baseBranch,
      baseCommit: "",
      fetched: false,
      copiedFiles: [],
      // `?upstream-warning` in a plain browser previews the warning toast.
      upstreamWarning: new URLSearchParams(window.location.search).has("upstream-warning") ? UPSTREAM_WARNING : null,
    };
  }
  return invoke<CreatedWorkspaceDto>("create_workspace", { ...args });
}

// The browser stand-in has no gh, so it lists samples (one fork PR among them).
const SAMPLE_PRS: CreateFrom[] = [
  { kind: "pr", number: 128, title: "Fix login redirect loop", headBranch: "fix/login-redirect", baseBranch: "main" },
  { kind: "pr", number: 121, title: "Add dark mode toggle", headBranch: "feat/dark-mode", baseBranch: "main" },
  { kind: "pr", number: 117, title: "Fix typo in README", headBranch: "main", baseBranch: "main", headOwner: "octocat", crossRepository: true },
];
const SAMPLE_ISSUES: CreateFrom[] = [
  { kind: "issue", provider: "github", key: "#42", title: "Crash when opening an empty repo", body: "Steps: add a repo with no commits." },
  { kind: "issue", provider: "linear", key: "ENG-7", title: "Keyboard shortcut for new workspace" },
];

/**
 * Open PRs of the repository checked out at `repoPath`, newest-updated first
 * (`pr_list_open`, via gh). Without a local checkout there is no remote to ask.
 */
export async function listPullRequests(repoPath: string | null): Promise<SourceState<CreateFrom>> {
  if (!inTauri()) return { status: "ready", items: SAMPLE_PRS };
  if (!repoPath) return { status: "unavailable", reason: "no_remote" };
  try {
    const prs = await invoke<OpenPrDto[]>("pr_list_open", { repoPath });
    return { status: "ready", items: prs.map(prToFrom) };
  } catch (e) {
    return listErrorState(e);
  }
}

/** Open GitHub issues (`gh_issue_list_open`). Linear has no backend yet, so it is not listed. */
export async function listIssues(repoPath: string | null): Promise<SourceState<CreateFrom>> {
  if (!inTauri()) return { status: "ready", items: SAMPLE_ISSUES };
  if (!repoPath) return { status: "unavailable", reason: "no_remote" };
  try {
    const issues = await invoke<OpenIssueDto[]>("gh_issue_list_open", { repoPath });
    return { status: "ready", items: issues.map(issueToFrom) };
  } catch (e) {
    return listErrorState(e);
  }
}

/**
 * Renames the workspace's git branch. The backend has no rename command yet
 * (requested from the workspace lifecycle owner), so in Tauri this rejects and
 * the caller keeps the old branch; the browser stand-in always succeeds.
 */
export async function renameWorkspaceBranch(workspaceId: string, branchName: string): Promise<void> {
  if (!inTauri()) return;
  await invoke("rename_workspace_branch", { workspaceId, branchName });
}

/**
 * `[git]` branch prefix settings and the GitHub username. The browser stand-in
 * uses the defaults, with `?ghuser=` / `?prefix=` overrides for previews.
 */
export async function loadBranchPrefix(): Promise<BranchPrefixInfo> {
  if (!inTauri()) {
    const q = new URLSearchParams(window.location.search);
    const custom = q.get("prefix");
    return custom === null
      ? { branchPrefixType: "github_username", branchPrefix: null, githubUsername: q.get("ghuser") }
      : { branchPrefixType: custom ? "custom" : "none", branchPrefix: custom || null, githubUsername: q.get("ghuser") };
  }
  return invoke<BranchPrefixInfo>("branch_prefix_settings");
}

/** Tauri rejects with the Rust error string; keep it readable in the dialog. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
