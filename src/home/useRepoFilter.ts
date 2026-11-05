import { useCallback, useEffect, useState } from "react";
import type { Repo } from "../state/types";
import { REPO_FILTER_SETTING, reconcileRepoFilter, type RepoFilter } from "./repoFilter";

// Conductor keeps the filter in its settings table (`sidebar_repo_filter`);
// OpenConductor's settings have no such key yet, so it lives in localStorage
// under the same name.
const STORAGE_KEY = `openconductor.${REPO_FILTER_SETTING}`;

function read(): RepoFilter {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function write(filter: RepoFilter) {
  try {
    if (filter === undefined) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, filter);
  } catch {
    /* storage unavailable: the filter lasts for this session only */
  }
}

/**
 * The sidebar's project filter, persisted, and cleared once `repos` has loaded
 * without the filtered repository (as Conductor's `hBi` effect does).
 */
export function useRepoFilter(repos: readonly Pick<Repo, "id">[], loaded: boolean): [RepoFilter, (next: RepoFilter) => void] {
  const [filter, setFilterState] = useState<RepoFilter>(read);
  const setFilter = useCallback((next: RepoFilter) => {
    write(next);
    setFilterState(next);
  }, []);
  const reconciled = reconcileRepoFilter(filter, repos, loaded);
  useEffect(() => {
    if (reconciled !== filter) setFilter(reconciled);
  }, [reconciled, filter, setFilter]);
  return [reconciled, setFilter];
}
