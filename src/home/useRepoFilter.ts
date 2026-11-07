import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect } from "react";
import { setAppPref, useAppPrefs } from "../settings/appPrefs";
import type { Repo } from "../state/types";
import { REPO_FILTER_SETTING, reconcileRepoFilter, type RepoFilter } from "./repoFilter";

// Conductor keeps the filter in conductor.db's settings table
// (`sidebar_repo_filter`, the repository id; "All projects" deletes the row).
// The desktop app does the same through the app preferences store. The
// browser build has no database, so it keeps the filter in localStorage under
// the same name.
const STORAGE_KEY = `openconductor.${REPO_FILTER_SETTING}`;

function readLocal(): RepoFilter {
  try {
    return localStorage.getItem(STORAGE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The stored filter, read once (for code outside the sidebar, such as opening
 * Create): the app preference on desktop, localStorage in the browser.
 */
export function storedRepoFilter(desktopPref: string | null | undefined): RepoFilter {
  return isTauri() ? (desktopPref ?? undefined) : readLocal();
}

function writeSetting(filter: RepoFilter) {
  setAppPref({ key: "sidebar_repo_filter", value: filter ?? null }).catch((err) =>
    console.error("conductor.db: could not save the project filter", err),
  );
}

/**
 * The sidebar's project filter, persisted, and cleared once `repos` has loaded
 * without the filtered repository (as Conductor's `hBi` effect does).
 */
export function useRepoFilter(repos: readonly Pick<Repo, "id">[], loaded: boolean): [RepoFilter, (next: RepoFilter) => void] {
  const filter = useAppPrefs().sidebar_repo_filter ?? undefined;
  const setFilter = useCallback((next: RepoFilter) => writeSetting(next), []);
  const reconciled = reconcileRepoFilter(filter, repos, loaded);
  useEffect(() => {
    if (reconciled !== filter) setFilter(reconciled);
  }, [reconciled, filter, setFilter]);
  return [reconciled, setFilter];
}
