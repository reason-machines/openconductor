import { buildTree, type TreeDir } from "../files/tree.ts";
import type { FileDiff } from "./types.ts";

export type ChangesView = "flat" | "tree";
export type ChangeRow =
  | { kind: "file"; file: FileDiff; name: string; depth: number }
  | { kind: "directory"; path: string; name: string; depth: number; expanded: boolean; additions: number; deletions: number };

export function changeRows(files: readonly FileDiff[], view: ChangesView, collapsed: ReadonlySet<string>): ChangeRow[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  if (view === "flat") return sorted.map((file) => ({ kind: "file", file, name: file.path, depth: 0 }));
  const result: ChangeRow[] = [];
  const totals = (dir: TreeDir): { additions: number; deletions: number } => {
    const children = dir.dirs.map(totals);
    for (const path of dir.files) {
      const file = byPath.get(path);
      if (file) children.push(file);
    }
    return children.reduce((sum, child) => ({ additions: sum.additions + child.additions, deletions: sum.deletions + child.deletions }), { additions: 0, deletions: 0 });
  };
  const walk = (parent: TreeDir, depth: number) => {
    for (const child of parent.dirs) {
      let dir = child;
      let name = dir.name;
      while (dir.files.length === 0 && dir.dirs.length === 1) {
        dir = dir.dirs[0];
        name += ` / ${dir.name}`;
      }
      const expanded = !collapsed.has(dir.path);
      result.push({ kind: "directory", path: dir.path, name, depth, expanded, ...totals(dir) });
      if (expanded) walk(dir, depth + 1);
    }
    for (const path of parent.files) {
      const file = byPath.get(path);
      if (file) result.push({ kind: "file", file, name: path.slice(path.lastIndexOf("/") + 1), depth });
    }
  };
  walk(buildTree(sorted.map((file) => file.path)), 0);
  return result;
}
