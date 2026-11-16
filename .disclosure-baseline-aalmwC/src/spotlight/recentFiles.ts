// Recently opened files, per repository, for quick open's empty state.
//
// Evidence (evidence/quick_open/NOTES.md, Conductor v0.87.6): a persisted
// store `recent-files-storage` of `{repositoryId, path, timestamp}`, newest
// first, de-duplicated per repository and path, capped at 200;
// `getRecentFiles(repo, n = 5)`. A pick is recorded before navigating.

export const RECENT_FILES_STORAGE_KEY = "recent-files-storage";
export const MAX_RECENT_FILES = 200;
export const DEFAULT_RECENT_COUNT = 5;

export interface RecentFile {
  repositoryId: string;
  path: string;
  timestamp: number;
}

export function addRecentFile(list: readonly RecentFile[], entry: RecentFile): RecentFile[] {
  const rest = list.filter((r) => !(r.repositoryId === entry.repositoryId && r.path === entry.path));
  return [entry, ...rest].slice(0, MAX_RECENT_FILES);
}

export function getRecentFiles(
  list: readonly RecentFile[],
  repositoryId: string,
  n = DEFAULT_RECENT_COUNT,
): RecentFile[] {
  return list.filter((r) => r.repositoryId === repositoryId).slice(0, n);
}

/** Parse stored JSON; anything malformed becomes an empty list. */
export function parseRecentFiles(raw: string | null): RecentFile[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter(
        (r): r is RecentFile =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as RecentFile).repositoryId === "string" &&
          typeof (r as RecentFile).path === "string" &&
          typeof (r as RecentFile).timestamp === "number",
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RECENT_FILES);
  } catch {
    return [];
  }
}
