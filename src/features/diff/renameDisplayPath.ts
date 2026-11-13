import type { ChangesView } from "./changesTree.ts";

export function renameDisplayPath({ oldPath, path, view }: { oldPath: string; path: string; view: ChangesView }): string {
  if (view === "flat") return oldPath;
  const oldParts = oldPath.split("/").filter(Boolean);
  const newParts = path.split("/").filter(Boolean);
  return oldParts.slice(0, -1).join("/") === newParts.slice(0, -1).join("/") ? oldParts.at(-1) ?? oldPath : oldPath;
}
