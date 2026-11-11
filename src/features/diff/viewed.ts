// parity:diff.viewed:ui
import type { FileDiff } from "./types.ts";

export type ViewedMap = Record<string, number>;

export function isViewed(map: ViewedMap, file: FileDiff): boolean {
  const viewedAt = map[file.path];
  const modified = file.last_modified_time;
  return viewedAt !== undefined && modified !== undefined && viewedAt >= modified;
}

export function setViewed(map: ViewedMap, file: FileDiff, viewed: boolean): ViewedMap {
  const next = { ...map };
  if (viewed) next[file.path] = Date.now();
  else delete next[file.path];
  return next;
}

export function toggleViewed(map: ViewedMap, file: FileDiff): ViewedMap {
  return setViewed(map, file, !isViewed(map, file));
}

export function viewedCount(map: ViewedMap, files: FileDiff[]): number {
  return files.filter((f) => isViewed(map, f)).length;
}

const key = (workspaceId: string) => `openconductor.diff.viewed.${workspaceId}`;

export function loadViewed(storage: Pick<Storage, "getItem">, workspaceId: string): ViewedMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key(workspaceId)) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const marks: ViewedMap = {};
      for (const [path, value] of Object.entries(parsed)) {
        if (typeof value === "number" && Number.isFinite(value)) marks[path] = value;
      }
      return marks;
    }
  } catch {
    // Corrupt entries are treated as "nothing viewed".
  }
  return {};
}

export function saveViewed(storage: Pick<Storage, "setItem">, workspaceId: string, map: ViewedMap): void {
  storage.setItem(key(workspaceId), JSON.stringify(map));
}
