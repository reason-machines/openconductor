// Home's "N/M cities visited" line (Conductor v0.87.6, REA on the decoded
// bundle: renderApp-D_fmY7hW.js `Xrs` @1,924,243, index-BGEQ8YjU.js `T8t`,
// `wqt`, `tq`, `bE`, `_qt` @212,242). Conductor takes every workspace's
// original directory name, strips a trailing `-vN`, keeps the names that are
// cities in its list, and counts the distinct ones over the size of that list.
// M here is our own city list (src/workspace/naming.ts), not Conductor's 385.
import type { Repo } from "../state/types";
import { CITIES } from "../workspace/naming.ts";

const CITY_NAMES = new Set(CITIES.map((c) => c.name.toLowerCase()));

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
  return CITIES.map((c) => c.name).filter((name) => named.has(name.toLowerCase()));
}

/** Size of the city catalogue the cities line counts against. */
export const CITY_TOTAL = CITIES.length;
