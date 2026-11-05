// Sidebar row label for a workspace, after Conductor's display-name rule
// (`$V` in the decoded renderApp chunk, read with REA on the shipped app):
//   1. a name the user set wins;
//   2. then the PR title;
//   3. then the branch, prettified, unless it is the target branch;
//   4. else the directory name, prettified.
// Conductor also keeps a separate custom workspace name between 1 and 2, and
// strips a configured branch prefix before prettifying; we have neither yet.

export interface LabelInput {
  name: string;
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

export function workspaceLabel({ name, branch, prTitle, userSetWorkspaceName, targetBranch }: LabelInput): string {
  if (userSetWorkspaceName) return name;
  if (prTitle) return prTitle;
  if (branch && branch !== targetBranch) return prettifyBranch(branch);
  return prettifyBranch(name);
}

/** Sidebar order inside a repo group: most recently updated first (Conductor sorts by updatedAt desc). */
export function byRecentActivity<T extends { createdAt: number; updatedAt?: number }>(workspaces: readonly T[]): T[] {
  return [...workspaces].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}
