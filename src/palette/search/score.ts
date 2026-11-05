// Fuzzy command score in [0, 1]. Our own scorer: every query character must
// appear in order in the candidate; contiguous runs, word starts and an early
// first match score higher. The palette hides items at or below
// FILTER_THRESHOLD (0.2 per evidence/search-palette/README.md).

export const FILTER_THRESHOLD = 0.2;

const WORD_BREAK = /[\s\-_./:]/;

function scoreOne(candidate: string, query: string): number {
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  if (q.length === 0) return 1;
  if (c === q) return 1;
  if (c.startsWith(q)) return 0.95;
  let total = 0;
  let ci = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    if (ch === " ") continue;
    // Continue a contiguous run if possible, else jump to a word start,
    // else take the next occurrence.
    const first = c.indexOf(ch, ci);
    if (first === -1) return 0;
    let at = first;
    if (first !== prev + 1) {
      for (let i = first; i < c.length; i++) {
        if (c[i] === ch && (i === 0 || WORD_BREAK.test(c[i - 1]))) {
          at = i;
          break;
        }
      }
    }
    let s = 0.3;
    if (at === prev + 1) s = 0.9;
    else if (at === 0 || WORD_BREAK.test(c[at - 1])) s = 0.8;
    total += s;
    prev = at;
    ci = at + 1;
  }
  const significant = q.replace(/ /g, "").length;
  const avg = total / significant;
  // Penalise long candidates a little so tighter matches rank first.
  return Math.min(0.94, avg * (0.9 + 0.1 * Math.min(1, significant / c.length)));
}

/** Best score of the query against the value and any keywords. */
export function commandScore(value: string, query: string, keywords: readonly string[] = []): number {
  let best = scoreOne(value, query);
  for (const k of keywords) best = Math.max(best, scoreOne(k, query) * 0.9);
  return best;
}

/** Score if it clears the threshold, else 0 (hidden). */
export function filterScore(value: string, query: string, keywords: readonly string[] = []): number {
  const s = commandScore(value, query, keywords);
  return s > FILTER_THRESHOLD ? s : 0;
}

/** Every whitespace-separated token is a substring of one of the fields. */
export function tokensMatch(query: string, fields: readonly string[]): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = fields.map((f) => f.toLowerCase());
  return tokens.every((t) => hay.some((h) => h.includes(t)));
}
