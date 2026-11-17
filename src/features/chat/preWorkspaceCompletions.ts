import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { FileMatch } from "../../spotlight/quickOpen.ts";
type FileEntry = FileMatch["file"];
import { prBranchName, type CreateFrom } from "../../workspace/createFlow.ts";
import type { AgentCommands } from "./slashCompletions.ts";

export interface PreWorkspaceCompletions extends Pick<AgentCommands, "slashCommands" | "skills"> {
  files: FileEntry[];
}
export interface CompletionIdentity { repositoryId: string; ref: string; agentType: string }
export type CompletionState =
  | { key: string; status: "ready"; data: PreWorkspaceCompletions }
  | { key: string; status: "loading" }
  | { key: string; status: "error"; message: string };

/** The selected creation source, NOT the current checkout or the merge target. */
export function preWorkspaceRef(from: CreateFrom | null, baseBranch: string): string {
  return from?.kind === "branch" ? from.name : from?.kind === "pr" ? prBranchName(from) : baseBranch;
}

export function completionIdentityKey(identity: CompletionIdentity): string {
  return JSON.stringify([identity.repositoryId, identity.ref, identity.agentType]);
}

/** Our local Git snapshot adapter; no remote fetch, CLI launch or workspace creation. */
export function fetchPreWorkspaceCompletions(identity: CompletionIdentity): Promise<PreWorkspaceCompletions> {
  return invoke<PreWorkspaceCompletions>("pre_workspace_completions", { ...identity });
}

/** Rank an immutable supplied tree using the existing native quick-open matcher. */
export function searchPreWorkspaceFiles(files: FileEntry[], query: string): Promise<FileMatch[]> {
  return invoke<FileMatch[]>("fuzzy_match_files", { files, query, excludeDirectories: false });
}

export function usePreWorkspaceCompletions(identity: CompletionIdentity | null): CompletionState | null {
  const key = identity ? completionIdentityKey(identity) : null;
  const [state, setState] = useState<CompletionState | null>(null);
  useEffect(() => {
    if (!identity || !isTauri()) return;
    let live = true;
    setState({ key: key!, status: "loading" });
    void fetchPreWorkspaceCompletions(identity).then(
      (data) => { if (live) setState({ key: key!, status: "ready", data }); },
      (error: unknown) => { if (live) setState({ key: key!, status: "error", message: String(error instanceof Error ? error.message : error) }); },
    );
    return () => { live = false; };
    // The stable key covers every field; a newly allocated identity is not a new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // Hide the old result during the render BEFORE effect cleanup/replacement.
  return state?.key === key ? state : null;
}
