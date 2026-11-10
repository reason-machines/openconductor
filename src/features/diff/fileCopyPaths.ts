export function fileCopyPaths(filePath: string, worktree?: string | null): { path: string; relativePath: string | undefined } {
  return {
    path: worktree ? `${worktree.replace(/\/+$/, "")}/${filePath}` : filePath,
    relativePath: worktree ? filePath : undefined,
  };
}
