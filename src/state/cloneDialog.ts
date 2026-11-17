// "Clone GitHub repo" dialog: the pure parts (placeholder, validation, recent
// repo selection, progress log, error mapping). Behaviour follows
// evidence/screens/clone-dialog.md.

export type GitProtocol = "ssh" | "https";

/** One entry of GitHub's `GET /user/repos`, only the fields the dialog uses. */
export interface RecentRepo {
  id: number;
  full_name: string;
  description: string | null;
  clone_url: string;
  ssh_url: string;
  owner: { avatar_url: string };
}

/** Lines the progress log keeps (the newest 51, as Conductor's `slice(-50)` plus one). */
export const CLONE_LOG_LIMIT = 51;

export function urlPlaceholder(protocol: GitProtocol | undefined): string {
  return protocol === "ssh" ? "git@github.com:user/repo.git" : "https://github.com/user/repo.git";
}

/** The first validation error, checked in this order, or null. */
export function validateClone(url: string, location: string): string | null {
  if (!url) return "Enter a repository URL";
  if (!location) return "Select a directory";
  return null;
}

export function canClone(url: string, location: string, pending: boolean): boolean {
  return !pending && !!url && !!location;
}

export function cloneButtonLabel(pending: boolean): string {
  return pending ? "Cloning..." : "Clone repo";
}

export function recentRepoUrl(repo: RecentRepo, protocol: GitProtocol | undefined): string {
  return protocol === "ssh" ? repo.ssh_url : repo.clone_url;
}

export function isSelectedRepo(repo: RecentRepo, url: string): boolean {
  return repo.clone_url === url || repo.ssh_url === url;
}

/** Appends one progress line, keeping the newest `CLONE_LOG_LIMIT`. */
export function appendLog(log: readonly string[], line: string): string[] {
  return [...log.slice(-(CLONE_LOG_LIMIT - 1)), line];
}

/** The log box shows the newest line first. */
export function logText(log: readonly string[]): string {
  return [...log].reverse().join("\n");
}

/** The saved location when it still exists, otherwise the default clone directory. */
export function initialLocation(saved: string | null, savedExists: boolean, fallback: string): string {
  return saved && savedExists ? saved : fallback;
}

/** `https://host/path.git` to `git@host:path.git`; undefined for anything else. */
export function toSshUrl(url: string): string | undefined {
  const m = url.trim().match(/^https:\/\/([^/:]+)\/(.+?)\.git$/i);
  return m ? `git@${m[1]}:${m[2]}.git` : undefined;
}

/** `git@host:path` or `ssh://[user@]host[:port]/path` to `https://host/path.git`. */
export function toHttpsUrl(url: string): string | undefined {
  const u = url.trim();
  const m =
    u.match(/^git@([^:/\s]+):(.+?)(?:\.git)?\/?$/) ??
    u.match(/^ssh:\/\/(?:[^@/\s]+@)?([^/:\s]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/);
  return m ? `https://${m[1]}/${m[2]}.git` : undefined;
}

export interface CloneErrorInput {
  errorMessage: string;
  remoteUrl: string;
  prefersSshUrls: boolean;
}

/** The message shown under the form when a clone fails. */
export function cloneErrorMessage({ errorMessage, remoteUrl, prefersSshUrls }: CloneErrorInput): string {
  const m = errorMessage.toLowerCase();
  if (m.includes("clone failed with code 128") && (m.includes("not found") || m.includes("does not exist"))) {
    return "Repository not found. Double-check the URL and make sure you have access";
  }
  const httpsAuth =
    m.includes("could not read username") || m.includes("could not read password") || m.includes("authentication failed");
  const ssh = toSshUrl(remoteUrl);
  if (httpsAuth && ssh) {
    return prefersSshUrls
      ? `Git couldn't authenticate over HTTPS. Your GitHub CLI is set up for SSH — use the SSH URL instead: ${ssh}`
      : `Git couldn't authenticate over HTTPS. Run "gh auth login" in a terminal, or use the SSH URL if you have SSH keys set up: ${ssh}`;
  }
  const https = toHttpsUrl(remoteUrl);
  if (m.includes("permission denied (publickey)") && https) {
    return `Git couldn't authenticate over SSH. Check your SSH keys, or use the HTTPS URL instead: ${https}`;
  }
  return `Couldn't clone repo: ${errorMessage}`;
}

/** The clone folder basename; remote names follow Conductor's sanitizer. */
export function cloneTargetName(url: string): string {
  const input = url.trim();
  const remote = input.includes("://")
    ? !input.startsWith("file://")
    : /^[^/\\:]+:/.test(input) && !/^[a-z]:[/\\]/i.test(input);
  const last = input.replace(/[/\\]+$/, "").split(/[/:]/).pop() ?? "";
  const basename = last.replace(/\.git$/i, "");
  const name = remote
    ? basename.toLowerCase().replace(/[^a-z0-9-_.]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")
    : basename;
  return name && name !== "." && name !== ".." ? name : "repo";
}
