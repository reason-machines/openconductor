export function repositoryGitHubUrl(remote: string | undefined): string | null {
  if (!remote) return null;
  const value = remote.trim().replace(/^git@github\.com:/, "https://github.com/");
  try {
    const url = new URL(value);
    if (url.hostname !== "github.com" || !["https:", "http:", "ssh:"].includes(url.protocol)) return null;
    const match = /^\/([^/]+)\/([^/]+?)\/?$/.exec(url.pathname);
    if (!match) return null;
    const repository = match[2].replace(/\.git$/, "");
    return repository ? `https://github.com/${match[1]}/${repository}` : null;
  } catch {
    return null;
  }
}
