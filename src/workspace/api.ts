// Bridge to the workspace lifecycle commands (src-tauri/src/workspace/commands.rs).
// Outside Tauri (vite dev, screenshots) each call has a local stand-in so the
// Create-workspace dialog still runs end to end.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../backend";
import type { CreateWorkspaceArgs } from "./createFlow";

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
}

/** Registers a local checkout with the backend (idempotent) and returns its backend id. */
export async function ensureRepository(path: string): Promise<RepositoryDto> {
  if (!inTauri()) return { id: path || "browser-repo", name: path, root: path, defaultBranch: "main" };
  return invoke<RepositoryDto>("add_repository", { path });
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
    };
  }
  return invoke<CreatedWorkspaceDto>("create_workspace", { ...args });
}

/** Tauri rejects with the Rust error string; keep it readable in the dialog. */
export function errorText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
