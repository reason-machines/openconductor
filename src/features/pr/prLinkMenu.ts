// The right-click menu of a pull request's number: Conductor's `w_i`, shown by
// the header PR pill (`RFt`) and the PR tab's "#N" title (`sKo`); renderApp
// chunk, read with REA as data. In order:
//   Open in <target> (arrow-up-right, ⌘⇧G) - the `pull_request_open_target`
//       setting for a github.com PR, else "Open in GitHub" / "Open remote"
//   Open in <each other target>             - only for a github.com PR
//   Copy link (copy)                        - "Copied PR link to clipboard"
//   Copy number (hash)                      - "Copied PR number to clipboard"
// Targets rewrite the URL (`fds`): Linear is linear.review/<owner>/<repo>/pull/<n>,
// Graphite is app.graphite.com/github/pr/<owner>/<repo>/<n>.
import { PR_OPEN_TARGETS } from "../../settings/prefs.ts";

export type PrOpenTarget = (typeof PR_OPEN_TARGETS)[number];

const GITHUB = "https://github.com/";
const LINEAR = "https://linear.review/";

export function isGitHubPrUrl(url: string): boolean {
  return url.startsWith(GITHUB);
}

/** The URL a target opens (`fds`); non-GitHub URLs open as they are. */
export function prUrlFor(url: string, target: PrOpenTarget): string {
  if (!isGitHubPrUrl(url)) return url;
  switch (target) {
    case "github":
      return url;
    case "linear":
      return `${LINEAR}${url.slice(GITHUB.length)}`;
    case "graphite":
      return url.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/, "https://app.graphite.com/github/pr/$1/$2/$3");
  }
}

const TARGET_LABEL: Record<PrOpenTarget, string> = { github: "Open in GitHub", linear: "Open in Linear", graphite: "Open in Graphite" };

export type PrLinkMenuItem =
  | { kind: "open"; label: string; url: string; primary: boolean }
  | { kind: "copy-link"; label: "Copy link"; text: string; toast: string }
  | { kind: "copy-number"; label: "Copy number"; text: string; toast: string };

/** The menu's items for a PR, given the user's open target and the repo's forge. */
export function prLinkMenu(url: string, number: number, target: PrOpenTarget, forge: "github" | "other" = "github"): PrLinkMenuItem[] {
  const github = isGitHubPrUrl(url);
  const main = github ? target : "github";
  const items: PrLinkMenuItem[] = [{ kind: "open", label: github ? TARGET_LABEL[main] : forge === "github" ? "Open in GitHub" : "Open remote", url: prUrlFor(url, main), primary: true }];
  if (github) for (const t of PR_OPEN_TARGETS) if (t !== main) items.push({ kind: "open", label: TARGET_LABEL[t], url: prUrlFor(url, t), primary: false });
  items.push({ kind: "copy-link", label: "Copy link", text: url, toast: "Copied PR link to clipboard" });
  items.push({ kind: "copy-number", label: "Copy number", text: String(number), toast: "Copied PR number to clipboard" });
  return items;
}
