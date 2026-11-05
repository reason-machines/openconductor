// The right panel's All files tree. Conductor's tab is a windowed tree of the
// worktree with 28 px rows (evidence/frontend/pierre-diff-options.md). Here
// the tree is built from the quick-open index (`fuzzy_filter_files` with an
// empty query: every file, .gitignore applied, sorted by path).

export interface TreeDir {
  name: string;
  /** Worktree-relative path, "" for the root. */
  path: string;
  dirs: TreeDir[];
  files: string[];
}

export interface TreeRow {
  kind: "dir" | "file";
  name: string;
  /** Worktree-relative path. */
  path: string;
  depth: number;
  expanded?: boolean;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** The folder tree for a list of worktree-relative file paths. */
export function buildTree(paths: readonly string[]): TreeDir {
  const root: TreeDir = { name: "", path: "", dirs: [], files: [] };
  const dirs = new Map<string, TreeDir>([["", root]]);
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let dir = dirs.get(path);
      if (!dir) {
        dir = { name: parts[i], path, dirs: [], files: [] };
        dirs.set(path, dir);
        parent.dirs.push(dir);
      }
      parent = dir;
    }
    if (parts.length > 0) parent.files.push(parts.join("/"));
  }
  const sort = (d: TreeDir) => {
    d.dirs.sort((a, b) => byName(a.name, b.name));
    d.files.sort((a, b) => byName(a.slice(a.lastIndexOf("/") + 1), b.slice(b.lastIndexOf("/") + 1)));
    d.dirs.forEach(sort);
  };
  sort(root);
  return root;
}

/**
 * The visible rows, children only under expanded folders. Folders and files
 * are sorted together by name, as Conductor's tree lists them.
 */
export function visibleRows(root: TreeDir, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (d: TreeDir, depth: number) => {
    const entries: (TreeRow & { dir?: TreeDir })[] = [
      ...d.dirs.map((sub) => ({ kind: "dir" as const, name: sub.name, path: sub.path, depth, expanded: expanded.has(sub.path), dir: sub })),
      ...d.files.map((f) => ({ kind: "file" as const, name: f.slice(f.lastIndexOf("/") + 1), path: f, depth })),
    ].sort((a, b) => byName(a.name, b.name));
    for (const { dir, ...row } of entries) {
      rows.push(row);
      if (dir && row.expanded) walk(dir, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Absolute path of a worktree-relative path. */
export function absolutePath(worktree: string, rel: string): string {
  return `${worktree.replace(/\/+$/, "")}/${rel}`;
}
