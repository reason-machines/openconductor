// Palette command scoring follows the retained custom filter in
// evidence/palette/create-section/source/custom-filter-spans.json.
export const FILTER_THRESHOLD = 0.2;

const PUNCTUATION = /[\\/_+.#"@[({&]/;
const PUNCTUATION_GLOBAL = /[\\/_+.#"@[({&]/g;
const WORD_BREAK = /[\s-]/;
const WORD_BREAK_GLOBAL = /[\s-]/g;

function scoreOne(candidate: string, query: string): number {
  if (query.length === 0) return 1;
  const normalizedCandidate = candidate.toLowerCase().replace(WORD_BREAK_GLOBAL, " ");
  const normalizedQuery = query.toLowerCase().replace(WORD_BREAK_GLOBAL, " ");
  const memo = new Map<string, number>();

  function match(candidateIndex: number, queryIndex: number): number {
    if (queryIndex === query.length) return candidateIndex === candidate.length ? 1 : 0.99;
    const key = `${candidateIndex},${queryIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    const character = normalizedQuery.charAt(queryIndex);
    let best = 0;
    for (let at = normalizedCandidate.indexOf(character, candidateIndex); at >= 0; at = normalizedCandidate.indexOf(character, at + 1)) {
      let score = match(at + 1, queryIndex + 1);
      if (score > best) {
        if (at !== candidateIndex) {
          const previous = candidate.charAt(at - 1);
          const skipped = candidate.slice(candidateIndex, at - 1);
          if (PUNCTUATION.test(previous)) {
            score *= 0.8;
            if (candidateIndex > 0) score *= 0.999 ** (skipped.match(PUNCTUATION_GLOBAL)?.length ?? 0);
          } else if (WORD_BREAK.test(previous)) {
            score *= 0.9;
            if (candidateIndex > 0) score *= 0.999 ** (skipped.match(WORD_BREAK_GLOBAL)?.length ?? 0);
          } else {
            score *= 0.17;
            if (candidateIndex > 0) score *= 0.999 ** (at - candidateIndex);
          }
        }
        if (candidate.charAt(at) !== query.charAt(queryIndex)) score *= 0.9999;
      }
      const previous = normalizedCandidate.charAt(at - 1);
      const nextQuery = normalizedQuery.charAt(queryIndex + 1);
      if ((score < 0.1 && previous === nextQuery) || (nextQuery === character && previous !== character)) {
        score = Math.max(score, match(at + 1, queryIndex + 2) * 0.1);
      }
      best = Math.max(best, score);
    }
    memo.set(key, best);
    return best;
  }

  return match(0, 0);
}

/** Score the value and keywords as one ordered search candidate. */
export function commandScore(value: string, query: string, keywords: readonly string[] = []): number {
  const candidate = [value, ...keywords.map((keyword) => keyword.trim())].join(" ");
  return scoreOne(candidate, query);
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
