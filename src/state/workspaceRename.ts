// The user-facing workspace rename (sidebar row menu > Rename), as Conductor v0.87.6 does it.
// Decoded index-BGEQ8YjU.js: `QQe` / `XQe` / `JQe` @1037643 (directory name, validation, what to
// persist), `the` @2888875 (branch segment), and renderApp-D_fmY7hW.js `_ya` / `Sya` @11007679
// (dialog default and the "Also rename branch" branch name).

/** Conductor's directory name for a typed workspace name. */
export function directoryNameFor(name: string): string {
  return name
    .trim()
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}\p{Mark}_-]/gu, "");
}

const DIRECTORY_NAME = /^[\p{Letter}\p{Number}\p{Mark}_-]+$/u;

/** Conductor's validation message for a directory name, or undefined when it is valid. */
export function directoryNameError(directoryName: string): string | undefined {
  if (!directoryName) return "Invalid workspace name";
  if (!DIRECTORY_NAME.test(directoryName)) return "Name can only contain letters, numbers, hyphens, and underscores";
  return undefined;
}

export interface RenameTarget {
  directoryName: string;
  workspaceName: string | null;
}

export type RenamePlan =
  | { kind: "unchanged" }
  | { kind: "invalid"; message: string }
  /** `workspaceName` is what `workspace_name` becomes: null when the typed name is the directory name. */
  | { kind: "rename"; newDirectoryName: string; workspaceName: string | null };

/** What renaming `target` to the typed (already trimmed) `name` changes. */
export function planRename(target: RenameTarget, name: string): RenamePlan {
  const newDirectoryName = directoryNameFor(name);
  const current = target.workspaceName ?? target.directoryName;
  if (newDirectoryName === target.directoryName && name === current) return { kind: "unchanged" };
  const message = directoryNameError(newDirectoryName);
  if (message) return { kind: "invalid", message };
  return { kind: "rename", newDirectoryName, workspaceName: name === newDirectoryName ? null : name };
}

/** The dialog's starting text: the stored workspace name, else the directory name. */
export function renameDefault(target: RenameTarget): string {
  return target.workspaceName ?? target.directoryName;
}

/** Branch segment for a name (Conductor's `the`; the same rule as the directory name). */
export const branchSegmentFor = directoryNameFor;

/** "Also rename branch": keep the current branch's prefix (up to the last `/`) and swap the rest. */
export function renamedBranch(currentBranch: string, name: string): string {
  const segment = branchSegmentFor(name);
  const slash = currentBranch.lastIndexOf("/");
  return slash < 0 ? segment : `${currentBranch.slice(0, slash + 1)}${segment}`;
}

/** Conductor's git name for a detached worktree; no branch to rename. */
export const DETACHED_HEAD = "(detached HEAD)";

/** The checkbox is enabled only with a real branch to rename. */
export function canRenameBranch(branch: string | undefined | null): boolean {
  return !!branch && branch !== DETACHED_HEAD;
}

/** localStorage key Conductor keeps the checkbox under (unchecked until first set). */
export const ALSO_RENAME_BRANCH_KEY = "rename-workspace-also-rename-local-branch";
