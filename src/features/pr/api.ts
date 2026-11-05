// Bridge to the PR commands (src-tauri/src/pr/commands.rs). Outside Tauri
// (vite dev / preview) every call answers from a demo scenario (demo.ts) so
// the PR control can be tried in a browser.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { demo } from "./demo.ts";
import type { CreatePrPrompt, GitState, HeaderInputs, HeaderState, LookupRequest, LookupResult, MergeMethod, WorkspacePrStatus, WorkspaceSync } from "./types.ts";

export async function lookupPr(repoPath: string, request: LookupRequest): Promise<LookupResult> {
  if (!isTauri()) return demo().lookup;
  const [result] = await invoke<LookupResult[]>("pr_lookup", { repoPath, requests: [request] });
  return result ?? { lookup: null, derivedStatus: null };
}

export async function gitState(workspacePath: string, targetBranch: string): Promise<GitState> {
  if (!isTauri()) return demo().git;
  return invoke<GitState>("pr_git_state", { workspacePath, targetBranch });
}

export async function headerState(inputs: HeaderInputs): Promise<HeaderState | null> {
  if (!isTauri()) return demo().header;
  return invoke<HeaderState | null>("pr_header_state", { inputs });
}

export async function createPrPrompt(request: CreatePrPrompt): Promise<string> {
  if (!isTauri()) return `Demo: open a ${request.draft ? "draft " : ""}pull request from ${request.branch} into ${request.remote}/${request.targetBranch}.`;
  return invoke<string>("pr_create_prompt", { request });
}

/** The message behind "Commit and push" (the reference's one-line agent instruction). */
export async function commitAndPushPrompt(): Promise<string> {
  if (!isTauri()) return "Commit and push all changes";
  return invoke<string>("pr_commit_and_push_prompt");
}

/**
 * The message behind "Resolve" on a PR with merge conflicts: rebase or merge
 * per the workspace's `pull.rebase`, then the repository's custom prompt.
 */
export async function resolveConflictsPrompt(workspacePath: string, targetBranch: string, custom: string | null): Promise<string> {
  if (!isTauri()) return `Demo: merge the remote \`${targetBranch}\` into this branch and resolve the conflicts, then commit the merge and push.`;
  return invoke<string>("pr_resolve_conflicts_prompt", { workspacePath, targetBranch, custom });
}

/** The repository's `custom_prompt_resolve_merge_conflicts` (conductor.db); null when unset or not in the database yet. */
export async function repoResolveConflictsPrompt(repoId: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("db_repo_prompt", { repoId, prompt: "resolveMergeConflicts" });
  } catch (e) {
    console.warn("pr: no repository resolve-conflicts prompt", e);
    return null;
  }
}

/** Merge now; resolves to the merge method used. */
export async function mergePr(repoPath: string, number: number, method?: MergeMethod): Promise<MergeMethod> {
  if (!isTauri()) return method ?? "squash";
  return invoke<MergeMethod>("pr_merge", { repoPath, number, method: method ?? null });
}

/** The method Merge uses for this repository (for the button's tooltip). */
export async function mergeMethod(repoPath: string): Promise<MergeMethod> {
  if (!isTauri()) return "squash";
  return invoke<MergeMethod>("pr_merge_method", { repoPath });
}

/** Take a draft PR out of draft (`gh pr ready`). */
export async function markReady(repoPath: string, number: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("pr_mark_ready", { repoPath, number });
}

/** Approve at `headOid`, the head commit the viewer saw. */
export async function approvePr(repoPath: string, number: number, headOid: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("pr_approve", { repoPath, number, headOid });
}

export async function setAutoMerge(repoPath: string, number: number, enabled: boolean, method?: MergeMethod): Promise<void> {
  if (!isTauri()) return;
  await invoke("pr_set_auto_merge", { repoPath, number, enabled, method: method ?? null });
}

/** Store a lookup's derived status, and the found PR's title and body, on the workspace row (desktop app only). */
export async function syncWorkspace(workspaceId: string, derivedStatus: WorkspacePrStatus, title: string | null, body: string | null): Promise<WorkspaceSync> {
  return invoke<WorkspaceSync>("pr_sync_workspace", { workspaceId, derivedStatus, title, body });
}
