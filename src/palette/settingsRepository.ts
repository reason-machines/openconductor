import type { AppState } from "../state/types.ts";
import { RECENT_STORAGE_KEY } from "./recentWorkspaces.ts";

export interface LastWorkspaceRoute {
  href: string;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readStore(storage: Storage | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RECENT_STORAGE_KEY) ?? "null");
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function repositoryFromRoute(route: LastWorkspaceRoute | undefined): string | undefined {
  if (!route) return;
  try {
    return /^\/repository\/([^/]+)\/workspace\/([^/]+)\/?$/.exec(new URL(route.href, "http://conductor.local").pathname)?.[1];
  } catch {
    return;
  }
}

export function loadLastWorkspaceRoute(storage: Storage | undefined = defaultStorage()): LastWorkspaceRoute | undefined {
  const state = readStore(storage).state;
  const route = isRecord(state) ? state.lastRoute : undefined;
  if (!isRecord(route) || typeof route.href !== "string") return;
  const result = { href: route.href };
  return repositoryFromRoute(result) ? result : undefined;
}

export function saveLastWorkspaceRoute(route: LastWorkspaceRoute, storage: Storage | undefined = defaultStorage()): void {
  if (!storage) return;
  const stored = readStore(storage);
  const state = isRecord(stored.state) ? stored.state : {};
  try {
    storage.setItem(RECENT_STORAGE_KEY, JSON.stringify({ ...stored, state: { ...state, lastRoute: route }, version: stored.version ?? 0 }));
  } catch {}
}

export function selectedWorkspaceRoute(state: AppState): LastWorkspaceRoute | undefined {
  const selection = state.selection;
  if (selection.kind !== "workspace") return;
  const repo = state.repos.find((candidate) => candidate.id === selection.repoId);
  const present = repo?.workspaces.some((workspace) => workspace.id === selection.workspaceId)
    || (state.archivedOpen?.repoId === selection.repoId && state.archivedOpen.workspace.id === selection.workspaceId);
  if (repo && present) return { href: `/repository/${repo.id}/workspace/${selection.workspaceId}` };
}

export function settingsRepositoryId(state: AppState, lastRoute: LastWorkspaceRoute | undefined): string | undefined {
  const repoId = repositoryFromRoute(selectedWorkspaceRoute(state) ?? lastRoute);
  return state.repos.find((repo) => repo.id === repoId)?.id ?? state.repos[0]?.id;
}
