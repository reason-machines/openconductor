// Multi-field fuzzy ranking shared by the help dialog and the key-bindings
// page. Mirrors Conductor's `WZ` helper (renderApp-D_fmY7hW.js).
import fuzzysort from "fuzzysort";

/** fuzzysort 3 scores run 0..1; a field scoring below this does not match. */
export const SEARCH_THRESHOLD = 0.5;

export interface FieldMatch<F extends string> {
  field: F;
  indexes: readonly number[];
}

export interface Ranked<T, F extends string> {
  item: T;
  match: FieldMatch<F>;
}

/**
 * Items where some field fuzzy-matches the query, best score first. Each item
 * keeps its best field; ties keep the earlier field and the input order.
 */
export function rankByFields<T, F extends string>(
  items: readonly T[],
  query: string,
  fields: Record<F, (item: T) => string>,
  threshold = SEARCH_THRESHOLD,
): Ranked<T, F>[] {
  const names = Object.keys(fields) as F[];
  const scored: { ranked: Ranked<T, F>; score: number }[] = [];
  for (const item of items) {
    let best: { score: number; match: FieldMatch<F> } | undefined;
    for (const field of names) {
      const result = fuzzysort.single(query, fields[field](item));
      if (!result || result.score < threshold) continue;
      if (!best || result.score > best.score) best = { score: result.score, match: { field, indexes: [...result.indexes] } };
    }
    if (best) scored.push({ ranked: { item, match: best.match }, score: best.score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.ranked);
}
