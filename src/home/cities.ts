import type { Repo } from "../state/types";
import { HOME_CITY_SLUGS } from "./cityCatalog.ts";

const CITY_NAMES = new Set(HOME_CITY_SLUGS);

/** `oslo-v2` and `Oslo` both name the city `oslo`. */
export function cityOf(directoryName: string): string | null {
  const base = directoryName.trim().replace(/-v\d+$/i, "").toLowerCase();
  return CITY_NAMES.has(base) ? base : null;
}

/** City slugs named by at least one workspace, in catalogue order. Archived workspaces count too. */
export function visitedCities(repos: Repo[]): string[] {
  const named = new Set<string>();
  for (const repo of repos) {
    for (const ws of repo.workspaces) {
      const city = cityOf(ws.directoryName ?? ws.name);
      if (city) named.add(city);
    }
  }
  return HOME_CITY_SLUGS.filter((name) => named.has(name));
}

/** Size of the city catalogue the cities line counts against. */
export const CITY_TOTAL = HOME_CITY_SLUGS.length;
