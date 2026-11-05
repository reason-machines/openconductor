// Ranking for Spotlight's workspace results (quick switch to a workspace).
//
// Evidence (evidence/search-palette/README.md, Conductor v0.87.6): workspace
// results use their own matcher, are sorted and capped at 50, and with an
// empty query the palette shows recent workspaces first. The scoring below is
// ours; Conductor's exact workspace matcher was not recovered.

export const MAX_WORKSPACE_RESULTS = 50;

export interface WorkspaceCandidate {
  id: string;
  name: string;
  branch: string;
  repoName: string;
  /** Last time the workspace was opened or active (ms). Higher is more recent. */
  lastActiveAt: number;
  archived?: boolean;
}

export interface RankedWorkspace<T extends WorkspaceCandidate = WorkspaceCandidate> {
  item: T;
  score: number;
}

/** How well one query token matches one field; 0 means no match. */
export function tokenScore(token: string, field: string): number {
  const f = field.toLowerCase();
  if (!token || !f) return 0;
  if (f === token) return 100;
  if (f.startsWith(token)) return 80;
  const at = f.indexOf(token);
  if (at > 0) return isWordStart(f, at) ? 60 : 40;
  return isSubsequence(token, f) ? 10 : 0;
}

function isWordStart(s: string, i: number): boolean {
  return /[\s/_.\-]/.test(s[i - 1]);
}

function isSubsequence(needle: string, hay: string): boolean {
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) if (hay[i] === needle[j]) j++;
  return j === needle.length;
}

/**
 * Every whitespace-separated token must match the workspace name, branch or
 * repository name; the workspace scores the sum of each token's best field
 * (name counts a little more than branch, branch more than repository).
 * Empty query: most recently active first. Archived workspaces sort after
 * active ones. Ties go to recency, then name.
 */
export function rankWorkspaces<T extends WorkspaceCandidate>(
  query: string,
  items: readonly T[],
  limit = MAX_WORKSPACE_RESULTS,
): RankedWorkspace<T>[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked: RankedWorkspace<T>[] = [];
  for (const item of items) {
    let score = 0;
    for (const t of tokens) {
      const best = Math.max(
        tokenScore(t, item.name) * 1.2,
        tokenScore(t, item.branch) * 1.1,
        tokenScore(t, item.repoName),
      );
      if (best === 0) {
        score = -1;
        break;
      }
      score += best;
    }
    if (score >= 0) ranked.push({ item, score });
  }
  ranked.sort(
    (a, b) =>
      Number(!!a.item.archived) - Number(!!b.item.archived) ||
      b.score - a.score ||
      b.item.lastActiveAt - a.item.lastActiveAt ||
      a.item.name.localeCompare(b.item.name),
  );
  return ranked.slice(0, limit);
}
