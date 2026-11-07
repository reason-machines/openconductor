import type { Repo, Selection, Workspace } from "../state/types.ts";
import { cityOf } from "./cities.ts";
import { PASSPORT_CITIES, type CityTier, type PassportCity } from "./passportCities.ts";

export interface PassportWorkspace {
  city: PassportCity;
  name: string;
  archived: boolean;
  selection: Extract<Selection, { kind: "workspace" }>;
}

const CITY_BY_SLUG = new Map(PASSPORT_CITIES.map((city) => [city.slug, city]));

export function passportWorkspaces(repos: readonly Repo[], archived: readonly { repoId: string; workspace: Workspace }[] = []): PassportWorkspace[] {
  const entries = new Map<string, PassportWorkspace>();
  const add = (repoId: string, workspace: Workspace) => {
    const name = workspace.directoryName ?? workspace.name;
    const slug = cityOf(name);
    const city = slug === null ? undefined : CITY_BY_SLUG.get(slug);
    if (city) entries.set(workspace.id, { city, name, archived: workspace.status === "archived" || workspace.state === "archived", selection: { kind: "workspace", repoId, workspaceId: workspace.id } });
  };
  for (const row of archived) add(row.repoId, row.workspace);
  for (const repo of repos) for (const workspace of repo.workspaces) add(repo.id, workspace);
  return [...entries.values()].sort((a, b) => Number(b.archived) - Number(a.archived));
}

export function passportVisited(workspaces: readonly PassportWorkspace[]) {
  const cities = new Set<string>();
  const tiers: Record<CityTier, Set<string>> = { common: new Set(), uncommon: new Set(), rare: new Set(), legendary: new Set() };
  for (const { city } of workspaces) {
    cities.add(city.slug);
    tiers[city.tier].add(city.slug);
  }
  return { cities, tiers };
}

export function passportSelection(workspace: PassportWorkspace): PassportWorkspace["selection"] | null {
  return workspace.archived ? null : workspace.selection;
}

export function projectCity([longitude, latitude]: readonly [number, number]): readonly [number, number] {
  const radians = Math.PI / 180;
  const m = Math.sqrt(3) / 2;
  const theta = Math.asin(m * Math.sin(latitude * radians));
  const theta2 = theta * theta;
  const theta6 = theta2 * theta2 * theta2;
  return [
    400 + 220 * longitude * radians * Math.cos(theta) / (m * (1.340264 + 3 * -0.081106 * theta2 + theta6 * (7 * 0.000893 + 9 * 0.003796 * theta2))),
    300 - 220 * theta * (1.340264 + -0.081106 * theta2 + theta6 * (0.000893 + 0.003796 * theta2)),
  ];
}

export interface PassportViewport { zoom: number; x: number; y: number }
export const INITIAL_PASSPORT_VIEW: PassportViewport = { zoom: 1, x: 0, y: 0 };

export function movePassport(view: PassportViewport, dx: number, dy: number): PassportViewport {
  return { zoom: view.zoom, x: view.x + dx, y: view.y + dy };
}

export function zoomPassport(view: PassportViewport, multiplier: number, anchor: readonly [number, number] = [400, 300]): PassportViewport {
  const zoom = Math.max(1, Math.min(8, view.zoom * multiplier));
  const ratio = zoom / view.zoom;
  return movePassport({ zoom, x: anchor[0] - (anchor[0] - view.x) * ratio, y: anchor[1] - (anchor[1] - view.y) * ratio }, 0, 0);
}
