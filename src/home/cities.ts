import type { Repo } from "../state/types";
import { CITIES } from "../workspace/naming.ts";

/** City slugs named by at least one workspace, in catalogue order. Archived workspaces count too. */
export function visitedCities(repos: Repo[]): string[] {
  const named = new Set<string>();
  for (const repo of repos) {
    for (const ws of repo.workspaces) {
      named.add(ws.name.trim().toLowerCase());
    }
  }
  return CITIES.map((c) => c.name).filter((name) => named.has(name));
}

/** Size of the city catalogue the cities line counts against. */
export const CITY_TOTAL = CITIES.length;
