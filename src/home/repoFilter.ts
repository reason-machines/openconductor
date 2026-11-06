// Narrowing the repository list to one project.
//
// Conductor v0.87.6 has no free-text repository search on Home or in the
// sidebar's Add-repository menu (renderApp-D_fmY7hW.js `Gji` @9741591: three
// actions, then "Recents"). Locally, the repository list is narrowed by the
// "Filter by project" submenu of the sidebar section header menu (`pra`
// @10018210), kept in the setting `sidebar_repo_filter`:
//
// - The submenu is offered only with more than one repository; its options are
//   "All projects" then every repository by name, and choosing "All projects"
//   deletes the setting (`gra`, `z6t` in index-BGEQ8YjU.js @420066).
// - With a filter set, repository groups other than the filtered one are left
//   out (`dBi` @10039334: `!n || repo.id === n`), but pinned workspaces stay
//   visible whatever their repository (`hBi` @10057527), so the Pinned group
//   is not filtered.
// - Once repositories have loaded, a filter naming a repository that no longer
//   exists is cleared (`hBi` @10058099).
//
// Free-text repository search exists only in the command palette's Projects
// tab and, for cloud organizations, the GitHub repository picker (`mfa`
// @10433420). See evidence/screens/repo-search.md.
import type { Repo } from "../state/types";

export const FILTER_BY_PROJECT = "Filter by project";
export const ALL_PROJECTS = "All projects";
/** Option value for "All projects"; any other value is a repository id. */
export const ALL_PROJECTS_VALUE = "all";

/** The setting Conductor keeps the filter in; absent means all projects. */
export const REPO_FILTER_SETTING = "sidebar_repo_filter";

/** A repository id, or undefined for all projects. */
export type RepoFilter = string | undefined;

export interface FilterOption {
  value: string;
  label: string;
}

/** The submenu's options, or null when there is at most one repository (no submenu). */
export function projectFilterOptions(repos: readonly Pick<Repo, "id" | "name">[]): FilterOption[] | null {
  if (repos.length <= 1) return null;
  return [{ value: ALL_PROJECTS_VALUE, label: ALL_PROJECTS }, ...repos.map((r) => ({ value: r.id, label: r.name }))];
}

/** The radio value to mark for a filter. */
export function filterToValue(filter: RepoFilter): string {
  return filter ?? ALL_PROJECTS_VALUE;
}

/** The filter a chosen radio value sets; "All projects" clears it. */
export function valueToFilter(value: string): RepoFilter {
  return value === ALL_PROJECTS_VALUE || value === "" ? undefined : value;
}

/** Clears a filter whose repository is gone, but only once the repository list has loaded. */
export function reconcileRepoFilter(filter: RepoFilter, repos: readonly Pick<Repo, "id">[], loaded: boolean): RepoFilter {
  if (!loaded || filter === undefined) return filter;
  return repos.some((r) => r.id === filter) ? filter : undefined;
}

/** Repository groups the sidebar shows under a filter. */
export function filterRepoGroups<R extends Pick<Repo, "id">>(repos: readonly R[], filter: RepoFilter): R[] {
  return filter === undefined ? [...repos] : repos.filter((r) => r.id === filter);
}

/**
 * The repository the create composer starts on. Conductor's `q4a`
 * (renderApp-D_fmY7hW.js @11027112) tries, in order: the requested
 * repository, the last repository chosen in the composer (its
 * `dispatcher-state-v1` `lastRepositoryIdByOrg`), the composer's current one,
 * the sidebar's project filter, then the first repository. OpenConductor does
 * not remember a last-chosen repository yet, so after the requested one the
 * filter decides. Any candidate that is not an available repository is skipped.
 */
export function createRepoDefault(
  repoIds: readonly string[],
  requested: string | null | undefined,
  filter: RepoFilter,
): string | null {
  const available = new Set(repoIds);
  if (requested && available.has(requested)) return requested;
  if (filter && available.has(filter)) return filter;
  return repoIds[0] ?? null;
}
