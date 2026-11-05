// One workspace's pull request: the PR lookup, the local git state and the
// header state derived from both, refreshed on a timer, when the agent
// finishes a turn, and after PR actions.
import { useCallback, useEffect, useRef, useState } from "react";
import { gitState, headerState, lookupPr } from "./api.ts";
import type { GitState, HeaderState, PrInfo, PrLookup } from "./types.ts";

/** How often an open workspace re-reads its PR (GitHub rate limits apply). */
export const POLL_MS = 30_000;

export interface PullRequestArgs {
  /** Worktree folder; nothing is read while the workspace has none. */
  worktree: string | null;
  branch: string;
  targetBranch: string;
  agentWorking: boolean;
  /** Called with each lookup and the one before it (null the first time). */
  onLookup?: (next: PrLookup, previous: PrLookup | null) => void;
}

export interface PullRequest {
  lookup: PrLookup | null;
  pr: PrInfo | null;
  git: GitState | null;
  header: HeaderState | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePullRequest({ worktree, branch, targetBranch, agentWorking, onLookup }: PullRequestArgs): PullRequest {
  const [lookup, setLookup] = useState<PrLookup | null>(null);
  const [git, setGit] = useState<GitState | null>(null);
  const [header, setHeader] = useState<HeaderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<PrLookup | null>(null);
  const onLookupRef = useRef(onLookup);
  onLookupRef.current = onLookup;
  const agentRef = useRef(agentWorking);
  agentRef.current = agentWorking;
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!worktree) return;
    const gen = generation.current;
    try {
      const prNumber = last.current?.kind === "found" ? last.current.info.number : null;
      const [g, result] = await Promise.all([
        gitState(worktree, targetBranch),
        lookupPr(worktree, { workspacePath: worktree, localBranch: branch, workspaceBranch: branch, prNumber }),
      ]);
      if (gen !== generation.current) return;
      const previous = last.current;
      const next = result.lookup ?? previous;
      last.current = next;
      const h = await headerState({
        pr: next,
        canCreatePr: g.canCreatePr,
        hasRemote: g.hasRemote,
        loading: next === null,
        hasChanges: g.hasChanges,
        hasUncommitted: g.hasUncommitted,
        agentWorking: agentRef.current,
        upstream: g.upstream,
        hasPendingComments: false,
        optionalChecksBlock: false,
      });
      if (gen !== generation.current) return;
      setGit(g);
      setLookup(next);
      setHeader(h);
      setError(null);
      if (result.lookup) onLookupRef.current?.(result.lookup, previous);
    } catch (e) {
      if (gen === generation.current) setError(String(e));
    }
  }, [worktree, branch, targetBranch]);

  // A different workspace or branch starts from scratch.
  useEffect(() => {
    generation.current++;
    last.current = null;
    setLookup(null);
    setGit(null);
    setHeader(null);
    setError(null);
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The agent may have committed, pushed or opened the PR during its turn.
  useEffect(() => {
    void refresh();
  }, [agentWorking, refresh]);

  const pr = lookup?.kind === "found" ? lookup.info : null;
  return { lookup, pr, git, header, error, refresh };
}
