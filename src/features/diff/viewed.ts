// parity:diff.viewed:ui
// "Viewed" marks per file. A mark remembers the file's content fingerprint,
// so a file that changes again after it was viewed shows as not viewed.
import type { FileDiff } from "./types.ts";

export type ViewedMap = Record<string, string>;

/** FNV-1a over the file's status and hunk lines; stable across reloads. */
export function fileFingerprint(file: FileDiff): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  feed(`${file.status}\0${file.old_path ?? ""}\0${file.binary ? 1 : 0}\0${file.additions}/${file.deletions}\0`);
  for (const hunk of file.hunks) {
    feed(`@${hunk.old_start},${hunk.new_start}\0`);
    for (const line of hunk.lines) feed(`${line.kind[0]}${line.text}\n`);
  }
  return h.toString(16).padStart(8, "0");
}

export function isViewed(map: ViewedMap, file: FileDiff): boolean {
  return map[file.path] === fileFingerprint(file);
}

export function setViewed(map: ViewedMap, file: FileDiff, viewed: boolean): ViewedMap {
  const next = { ...map };
  if (viewed) next[file.path] = fileFingerprint(file);
  else delete next[file.path];
  return next;
}

export function toggleViewed(map: ViewedMap, file: FileDiff): ViewedMap {
  return setViewed(map, file, !isViewed(map, file));
}

/** Drop marks for files that are no longer in the diff. */
export function pruneViewed(map: ViewedMap, files: FileDiff[]): ViewedMap {
  const present = new Set(files.map((f) => f.path));
  return Object.fromEntries(Object.entries(map).filter(([path]) => present.has(path)));
}

export function viewedCount(map: ViewedMap, files: FileDiff[]): number {
  return files.filter((f) => isViewed(map, f)).length;
}

const key = (workspaceId: string) => `openconductor.diff.viewed.${workspaceId}`;

export function loadViewed(storage: Pick<Storage, "getItem">, workspaceId: string): ViewedMap {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key(workspaceId)) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === "string")) as ViewedMap;
    }
  } catch {
    // Corrupt entries are treated as "nothing viewed".
  }
  return {};
}

export function saveViewed(storage: Pick<Storage, "setItem">, workspaceId: string, map: ViewedMap): void {
  storage.setItem(key(workspaceId), JSON.stringify(map));
}
