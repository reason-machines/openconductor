// Model for the "Keyboard shortcuts" help dialog: which commands it lists,
// how they group, and how its search ranks and highlights them. Follows
// Conductor's dialog (evidence/keybindings/README.md, "Help dialog").
import fuzzysort from "fuzzysort";
import { effectiveShortcuts, type Overrides } from "./overrides.ts";
import { COMMANDS } from "./registry.ts";
import { CATEGORIES, type Category, type Command, type Shortcut } from "./types.ts";

export const HELP_DIALOG_TITLE = "Keyboard shortcuts";
export const HELP_SEARCH_PLACEHOLDER = "Search shortcuts...";
/** fuzzysort 3 scores run 0..1; a field scoring below this does not match. */
export const HELP_SEARCH_THRESHOLD = 0.5;

export interface HelpRow {
  id: string;
  title: string;
  category: Category;
  /** Effective shortcuts (overrides applied), shown joined by "or". */
  shortcuts: readonly Shortcut[];
}

export interface HelpGroup {
  category: Category;
  rows: HelpRow[];
}

export interface HelpMatch {
  row: HelpRow;
  /** Matched character positions in the title, when the title was the best field. */
  titleIndexes?: readonly number[];
}

/** Commands that are not hidden and not tied to a dialog, in registry order. */
export function helpRows(overrides: Overrides = {}, commands: readonly Command[] = COMMANDS): HelpRow[] {
  return commands
    .filter((c) => !c.hidden && !c.when?.enableOnDialogIds?.length)
    .map((c) => ({ id: c.id, title: c.title, category: c.category, shortcuts: effectiveShortcuts(c.id, overrides) }));
}

/** Rows under category headings in category order; empty categories are dropped. */
export function groupRows(rows: readonly HelpRow[]): HelpGroup[] {
  return CATEGORIES.map((category) => ({ category, rows: rows.filter((r) => r.category === category) })).filter(
    (g) => g.rows.length > 0,
  );
}

const FIELDS = ["title", "category"] as const;

/**
 * Rows whose title or category fuzzy-matches the query, best score first.
 * Each row keeps its best-scoring field; ties keep the earlier field and
 * registry order. Undefined for a blank query (the dialog shows groups then).
 */
export function searchRows(rows: readonly HelpRow[], query: string): HelpMatch[] | undefined {
  if (!query.trim()) return undefined;
  const scored: { match: HelpMatch; score: number }[] = [];
  for (const row of rows) {
    let best: { field: (typeof FIELDS)[number]; score: number; indexes: number[] } | undefined;
    for (const field of FIELDS) {
      const result = fuzzysort.single(query, row[field]);
      if (!result || result.score < HELP_SEARCH_THRESHOLD) continue;
      if (!best || result.score > best.score) best = { field, score: result.score, indexes: [...result.indexes] };
    }
    if (best) scored.push({ match: { row, titleIndexes: best.field === "title" ? best.indexes : undefined }, score: best.score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.match);
}

export const noResultsText = (query: string): string => `No shortcuts found for "${query}"`;

export interface Segment {
  text: string;
  matched: boolean;
}

/** Split a title into matched and unmatched runs for highlighting. */
export function highlightSegments(text: string, indexes: readonly number[]): Segment[] {
  const hit = new Set(indexes);
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const matched = hit.has(i);
    const last = out[out.length - 1];
    if (last && last.matched === matched) last.text += text[i];
    else out.push({ text: text[i], matched });
  }
  return out;
}
