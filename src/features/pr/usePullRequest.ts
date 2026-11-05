// One workspace's pull request: the PR lookup, the local git state and the
// header state derived from both, refreshed on a timer, when the agent
// finishes a turn, and after PR actions.
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { gitState, headerState, lookupPr } from "./api.ts";
import { getSettings } from "../../settings/api.ts";
import { SETTINGS_CHANGED } from "../../settings/appearance.ts";
import { DEFAULT_PR_SETTINGS, prSettings, type PrSettings } from "./prSettings.ts";
import type { GitState, HeaderInputs, HeaderState, PrInfo, PrLookup, WorkspacePrStatus } from "./types.ts";

/** How often an open workspace re-reads its PR (GitHub rate limits apply). */
export const POLL_MS = 30_000;

export interface PullRequestArgs {
  /** Worktree folder; nothing is read while the workspace has none. */
  worktree: string | null;
  branch: string;
  targetBranch: string;
  agentWorking: boolean;
  /** The workspace's diff has unsent comments (changes requested then offers "Add all comments to chat"). */
  hasPendingComments?: boolean;
  /** Called with each lookup and the one before it (null the first time). */
  onLookup?: (next: PrLookup, previous: PrLookup | null) => void;
  /** Called with each lookup's derived workspace status and the PR it came from (null without one). */
  onDerivedStatus?: (status: WorkspacePrStatus, pr: PrInfo | null) => void;
}

export interface PullRequest {
  lookup: PrLookup | null;
  pr: PrInfo | null;
  git: GitState | null;
  header: HeaderState | null;
  settings: PrSettings;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePullRequest({ worktree, branch, targetBranch, agentWorking, hasPendingComments = false, onLookup, onDerivedStatus }: PullRequestArgs): PullRequest {
  const [lookup, setLookup] = useState<PrLookup | null>(null);
  const [git, setGit] = useState<GitState | null>(null);
  const [header, setHeader] = useState<HeaderState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<PrLookup | null>(null);
  const onLookupRef = useRef(onLookup);
  onLookupRef.current = onLookup;
  const onDerivedRef = useRef(onDerivedStatus);
  onDerivedRef.current = onDerivedStatus;
  const agentRef = useRef(agentWorking);
  agentRef.current = agentWorking;
  const pendingRef = useRef(hasPendingComments);
  pendingRef.current = hasPendingComments;
  /** The last header inputs, so a comment change re-derives the header without another lookup. */
  const inputsRef = useRef<HeaderInputs | null>(null);
  const generation = useRef(0);
  const settings = usePrSettings();
  const optionalChecksBlock = settings.optionalChecksBlock;

  const refresh = useCallback(async () => {
    // The browser preview answers from demo data (api.ts), so it needs no worktree.
    const path = worktree || (isTauri() ? null : "demo");
    if (!path) return;
    const gen = generation.current;
    try {
      const prNumber = last.current?.kind === "found" ? last.current.info.number : null;
      const [g, result] = await Promise.all([
        gitState(path, targetBranch),
        lookupPr(path, { workspacePath: path, localBranch: branch, workspaceBranch: branch, prNumber }),
      ]);
      if (gen !== generation.current) return;
      const previous = last.current;
      const next = result.lookup ?? previous;
      last.current = next;
      const inputs: HeaderInputs = {
        pr: next,
        canCreatePr: g.canCreatePr,
        hasRemote: g.hasRemote,
        loading: next === null,
        hasChanges: g.hasChanges,
        hasUncommitted: g.hasUncommitted,
        agentWorking: agentRef.current,
        upstream: g.upstream,
        hasPendingComments: pendingRef.current,
        optionalChecksBlock,
      };
      const h = await headerState(inputs);
      if (gen !== generation.current) return;
      setGit(g);
      setLookup(next);
      inputsRef.current = inputs;
      setHeader(h);
      setError(null);
      if (result.lookup) onLookupRef.current?.(result.lookup, previous);
      if (result.lookup && result.derivedStatus) onDerivedRef.current?.(result.derivedStatus, result.lookup.kind === "found" ? result.lookup.info : null);
    } catch (e) {
      if (gen === generation.current) setError(String(e));
    }
  }, [worktree, branch, targetBranch, optionalChecksBlock]);

  // A different workspace or branch starts from scratch.
  useEffect(() => {
    generation.current++;
    last.current = null;
    inputsRef.current = null;
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

  // Sending or adding a diff comment changes only the header, so re-derive it from the last inputs.
  useEffect(() => {
    const inputs = inputsRef.current;
    if (!inputs || inputs.hasPendingComments === hasPendingComments) return;
    const next = { ...inputs, hasPendingComments };
    inputsRef.current = next;
    const gen = generation.current;
    headerState(next).then(
      (h) => gen === generation.current && inputsRef.current === next && setHeader(h),
      (e: unknown) => gen === generation.current && setError(String(e)),
    );
  }, [hasPendingComments]);

  const pr = lookup?.kind === "found" ? lookup.info : null;
  return { lookup, pr, git, header, settings, error, refresh };
}

/** The PR settings, re-read when settings change elsewhere in the app. */
export function usePrSettings(): PrSettings {
  const [value, setValue] = useState<PrSettings>(DEFAULT_PR_SETTINGS);
  useEffect(() => {
    const load = () => void getSettings().then((s) => setValue(prSettings(s)), () => setValue(DEFAULT_PR_SETTINGS));
    load();
    window.addEventListener(SETTINGS_CHANGED, load);
    return () => window.removeEventListener(SETTINGS_CHANGED, load);
  }, []);
  return value;
}
