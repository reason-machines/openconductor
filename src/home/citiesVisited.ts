// Home's "N/M cities visited" line (Conductor v0.87.6, REA on the decoded
// bundle: renderApp-D_fmY7hW.js `Xrs` @1,924,243, index-BGEQ8YjU.js `T8t`,
// `wqt`, `tq`, `bE`, `_qt` @212,242). Conductor takes every workspace's
// original directory name, strips a trailing `-vN`, keeps the names that are
// cities in its list, and counts the distinct ones over the size of that list.
// It renders nothing while the count is 0. M here is our own city list
// (src/workspace/naming.ts), not Conductor's 385.

import type { Repo } from "../state/types";
import { CITIES } from "../workspace/naming.ts";

const CITY_NAMES = new Set(CITIES.map((c) => c.name.toLowerCase()));

/** `oslo-v2` and `Oslo` both name the city `oslo`. */
export function cityOf(directoryName: string): string | null {
  const base = directoryName.replace(/-v\d+$/, "").toLowerCase();
  return CITY_NAMES.has(base) ? base : null;
}

export function citiesVisited(repos: readonly Repo[]): { visited: number; total: number } {
  const seen = new Set<string>();
  for (const repo of repos) {
    for (const ws of repo.workspaces) {
      const city = cityOf(ws.directoryName ?? ws.name);
      if (city) seen.add(city);
    }
  }
  return { visited: seen.size, total: CITIES.length };
}
