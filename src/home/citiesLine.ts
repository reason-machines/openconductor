import type { Repo } from "../state/types";
import { CITIES } from "../workspace/naming.ts";

/**
 * The Home footer line: the cities that active workspace names are drawn from, so the
 * user sees which ones they have used. Only names that match a city count; returns
 * null when none do, and then the line is not shown.
 */
export function citiesVisited(repos: Repo[]): string[] {
  const cities = new Set(CITIES.map((c) => c.name.toLowerCase()));
  const found = new Set<string>();
  for (const repo of repos) {
    for (const w of repo.workspaces) {
      if (w.status === "archived") continue;
      const key = w.name.toLowerCase();
      if (cities.has(key)) found.add(key);
    }
  }
  return CITIES.filter((c) => found.has(c.name.toLowerCase())).map((c) => c.name);
}

export function citiesLine(repos: Repo[]): string | null {
  const names = citiesVisited(repos);
  return names.length === 0 ? null : `Cities visited: ${names.join(", ")}`;
}
