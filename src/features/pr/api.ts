// Bridge to the PR commands (src-tauri/src/pr/commands.rs). Outside Tauri
// (vite dev / preview) every call answers from a demo scenario (demo.ts) so
// the PR control can be tried in a browser.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { demo } from "./demo.ts";
import type { CreatePrPrompt, GitState, HeaderInputs, HeaderState, LookupRequest, LookupResult, MergeMethod } from "./types.ts";

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
