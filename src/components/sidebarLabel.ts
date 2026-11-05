// Sidebar row label for a workspace, after Conductor's display-name rule
// (`$V` in the decoded renderApp chunk, read with REA on the shipped app):
//   1. a name the user set wins (`workspace_name ?? directory_name`);
//   2. then any stored `workspace_name`, user-set or not;
//   3. then the PR title;
//   4. then the branch, prettified, unless it is the target branch;
//   5. else the directory name, prettified.
// Prettifying strips the configured branch prefix first (`pGe` / `zcs`). The
// target is the workspace's `intended_target_branch`, "main" when unset (the
// row decoder's `intended_target_branch ?? "main"`).

export interface LabelInput {
  /** `workspace_name ?? directory_name`. */
  name: string;
  /** `workspaces.workspace_name` as stored (null when none). */
  workspaceName?: string | null;
  /** The resolved branch prefix (`DQt`): "ada/", "feature/", or none. */
  branchPrefix?: string;
  branch?: string;
  prTitle?: string | null;
  userSetWorkspaceName?: boolean;
  /** Branch the workspace merges into, usually the repo's default branch. */
  targetBranch?: string;
}

/** "ada/dark-mode-tokens" -> "Ada/dark mode tokens" (Conductor's `pGe`). */
export function prettifyBranch(branch: string, branchPrefix?: string): string {
  const bare = branchPrefix && branch.startsWith(branchPrefix) ? branch.slice(branchPrefix.length) : branch;
  const spaced = bare.replace(/[-_]/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function workspaceLabel({ name, workspaceName, branchPrefix, branch, prTitle, userSetWorkspaceName, targetBranch }: LabelInput): string {
  if (userSetWorkspaceName) return name;
  if (workspaceName) return workspaceName;
  if (prTitle) return prTitle;
  if (branch && branch !== targetBranch) return prettifyBranch(branch, branchPrefix);
  return prettifyBranch(name, branchPrefix);
}

/** The target branch Conductor's row compares against (`intended_target_branch ?? "main"`). */
export const labelTargetBranch = (intendedTargetBranch: string | null | undefined): string => intendedTargetBranch ?? "main";

/** Sidebar order inside a repo group: most recently updated first (Conductor sorts by updatedAt desc). */
export function byRecentActivity<T extends { createdAt: number; updatedAt?: number }>(workspaces: readonly T[]): T[] {
  return [...workspaces].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}
