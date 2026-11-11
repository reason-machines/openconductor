// The command palette's Workspaces tab (Conductor 0.87.6's `l_a`, decoded
// renderApp chunk @10,883,000, read as data with REA). It filters the same way
// as Home's All workspaces (`UJo`) and shares its saved filters (`mFi`: route
// "all-workspaces", key "filters"), so the rows come from src/home/allWorkspaces.ts:
//   - every workspace, archived included, through the project and archive
//     filters and the query (`nOt`), newest `updatedAt` first, capped at 50 (`GHe`);
//   - active rows under "Workspaces", archived ones under "Archived";
//   - nothing matching: "No matching workspaces", with "Clear filters" whenever a
//     filter is set, the default "Hiding archived" included (`de`);
//   - the filter bar is `nFi` in its compact variant: "All projects" (only with
//     more than one project), then the "Archived workspaces" select.
// Pure, so node --test covers it.

import type { Repo } from "../state/types.ts";
import { hasActiveFilters, homeRows, type HomeFilters, type HomeRow } from "../home/allWorkspaces.ts";
import type { ArchivedWorkspace } from "../workspace/archivedList.ts";
import { RESULT_CAP } from "./search/model.ts";

export interface WorkspacesTabRows {
  active: HomeRow[];
  archived: HomeRow[];
}

export function workspacesTabRows(repos: readonly Repo[], filters: HomeFilters, query: string, archivedRows: readonly ArchivedWorkspace[] = []): WorkspacesTabRows {
  const rows = homeRows(repos, filters, query, archivedRows).slice(0, RESULT_CAP);
  return { active: rows.filter((r) => !r.archived), archived: rows.filter((r) => r.archived) };
}

/** The empty list's "Clear filters" button. */
export const showClearFilters = hasActiveFilters;

/** The compact project filter's label: "All projects", the project's name, or "<n> projects". */
export function compactProjectLabel(repos: readonly Repo[], projects: readonly string[]): string {
  if (projects.length === 0) return "All projects";
  if (projects.length === 1) return repos.find((r) => r.id === projects[0])?.name ?? "1 project";
  return `${projects.length} projects`;
}
