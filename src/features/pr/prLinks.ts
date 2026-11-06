// Where a PR opens, and the PR badge menu's items. Conductor 0.87.6 (renderApp-D_fmY7hW.js,
// read with REA on sven m5 max as data): `IFt` (a github.com PR), `fds` (the URL for a
// target), `d7t` / `Zsi` (the item labels) and `w_i` (the badge's right-click menu):
// the first item opens the PR on the `pull_request_open_target` setting's site, then,
// only for a github.com PR, one item per other site; then Copy link and Copy number.
// Pure: no Tauri, no React.

export type PrOpenTarget = "github" | "linear" | "graphite";

/** Conductor's `FE`: every site a PR can open on, in menu order. */
export const PR_OPEN_TARGETS: readonly PrOpenTarget[] = ["github", "linear", "graphite"];

const GITHUB = "https://github.com/";
const LINEAR_REVIEW = "https://linear.review/";

/** `IFt`: only a github.com PR can open on Linear or Graphite. */
export function isGithubPr(url: string): boolean {
  return url.startsWith(GITHUB);
}

/** `fds`: the PR's URL on `target`; any other forge's URL is kept as is. */
export function prUrlFor(url: string, target: PrOpenTarget): string {
  if (!isGithubPr(url)) return url;
  switch (target) {
    case "github":
      return url;
    case "linear":
      return `${LINEAR_REVIEW}${url.slice(GITHUB.length)}`;
    case "graphite":
      return url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/, "https://app.graphite.com/github/pr/$1/$2/$3");
  }
}

/** `d7t`: "Open in GitHub", "Open in Linear", "Open in Graphite". */
export function openTargetLabel(target: PrOpenTarget): string {
  return target === "github" ? "Open in GitHub" : target === "linear" ? "Open in Linear" : "Open in Graphite";
}

export interface PrOpenItem {
  label: string;
  url: string;
  /** The first item carries the "Open PR" shortcut (git.openInGitHub). */
  primary: boolean;
}

/**
 * The menu's open items: the setting's site first (for a PR off github.com, `Zsi`'s
 * "Open remote" at its own URL), then the other sites of a github.com PR.
 */
export function prOpenItems(url: string, target: PrOpenTarget): PrOpenItem[] {
  if (!isGithubPr(url)) return [{ label: "Open remote", url, primary: true }];
  return [
    { label: openTargetLabel(target), url: prUrlFor(url, target), primary: true },
    ...PR_OPEN_TARGETS.filter((t) => t !== target).map((t) => ({ label: openTargetLabel(t), url: prUrlFor(url, t), primary: false })),
  ];
}

/** `n5(…, "PR link")` / `n5(…, "PR number")`. */
export const copiedPrToast = (what: "link" | "number") => `Copied PR ${what} to clipboard`;
