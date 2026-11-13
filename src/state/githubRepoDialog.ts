// "Create a private GitHub repo?" dialog: the pure parts (name slug, status
// line, submit rules, owner errors). Behaviour follows
// evidence/screens/github-repo-dialog.md.

export interface GitHubOwner {
  login: string;
  kind: "user" | "org";
}

export interface GitHubOwners {
  owners: GitHubOwner[];
  orgsError: string | null;
}

export type AvailabilityState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; slug: string }
  | { kind: "taken"; slug: string }
  | { kind: "error"; slug: string };

/** Lowercase, `[^a-z0-9-]` to `-`, collapse runs, trim `-`, at most 100 characters. */
export function repoSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export interface StatusInput {
  ownersLoading: boolean;
  name: string;
  slug: string;
  availability: AvailabilityState;
}

export type StatusTone = "muted" | "error" | "ok";

/** The one status line under the repository name. */
export function statusLine({ ownersLoading, name, slug, availability: a }: StatusInput): { text: string; tone: StatusTone } | null {
  if (ownersLoading) return { text: "Loading GitHub owners...", tone: "muted" };
  if (!name.trim()) return null;
  if (!slug) return { text: "Repository name must include letters or numbers.", tone: "error" };
  if (a.kind === "error" && a.slug === slug) return { text: "Couldn't check repository availability.", tone: "error" };
  if (a.kind === "taken" && a.slug === slug) return { text: "This repository already exists.", tone: "error" };
  if (a.kind === "available" && a.slug === slug) return { text: "Repository name is available.", tone: "ok" };
  return { text: "Checking repository availability...", tone: "muted" };
}

/** Submit needs an owner, a slug, loaded owners, and that exact slug confirmed free. */
export function canSubmit(owner: string, slug: string, ownersLoaded: boolean, a: AvailabilityState, pending: boolean): boolean {
  return !pending && ownersLoaded && !!owner && !!slug && a.kind === "available" && a.slug === slug;
}

export function submitLabel(needsGitInit: boolean, pending: boolean): string {
  if (pending) return "Creating...";
  return needsGitInit ? "Initialize Git and create repo" : "Create repo and add project";
}

export function dialogDescription(needsGitInit: boolean, existingOriginUrl?: string): string {
  if (needsGitInit) {
    return "This folder is not a Git repository. OpenConductor will run git init, create a private GitHub repo, add it as origin and push the current branch.";
  }
  if (existingOriginUrl) {
    return `This folder's origin (${existingOriginUrl}) is not on GitHub. It will be renamed to upstream, then a private GitHub repo is created as origin and the current branch pushed.`;
  }
  return "This folder does not have a GitHub remote. OpenConductor will create a private GitHub repo, add it as origin and push the current branch.";
}

/** Message for a failed owners load (the signed-in user could not be read). */
export function ownersErrorMessage(detail: string): string {
  const d = detail.toLowerCase();
  if (d.includes("saml")) return "Your organization requires SAML single sign-on for this token. Authorize it on GitHub, then try again.";
  if (d.includes("scope")) return "Your GitHub token is missing a required scope. Run gh auth refresh -s repo,read:org, then try again.";
  if (d.includes("gh auth login") || d.includes("not logged") || d.includes("401") || d.includes("bad credentials")) {
    return "You're not signed in to GitHub. Run gh auth login, then try again.";
  }
  return `Couldn't load GitHub owners: ${detail}`;
}

/** Muted note when the user loaded but their organizations did not. */
export function orgsErrorMessage(detail: string): string {
  if (detail.toLowerCase().includes("read:org")) return "Couldn't load organizations: your token needs the read:org scope. You can still use your personal account.";
  return "Couldn't load your organizations. You can still use your personal account.";
}

export function createFailedMessage(err: unknown): string {
  return `Couldn't create GitHub repo: ${err instanceof Error ? err.message : String(err)}`;
}
