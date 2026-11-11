// parity:diff.changes-list:ui
// The Changes tab's "Filter files" control. Mirrors Conductor 0.87.6
// (renderApp-D_fmY7hW.js): `gyi` filters the changed files, `xws` is the
// header toggle and `_ws` decides when it shows and what a click does.
import { rankByFields } from "../../keybindings/fuzzy.ts";

/**
 * The changed files whose path or old path (a rename's source) fuzzy-matches
 * the trimmed query, in their original order. A blank query keeps every file.
 * Conductor ranks with `WZ` and no threshold, then keeps the list order.
 */
export function filterChangedFiles<F extends { path: string; old_path: string | null }>(files: readonly F[], query: string): F[] {
  const q = query.trim();
  if (q === "") return [...files];
  const hits = new Set(rankByFields(files, q, { path: (f) => f.path, oldPath: (f) => f.old_path ?? "" }, -Infinity).map((r) => r.item));
  return files.filter((f) => hits.has(f));
}

/** The filter row shows while it is open or still holds text. */
export const filterActive = (open: boolean, query: string): boolean => open || query !== "";

/** The toggle shows while the filter is active, or when there is more than one file to filter. */
export const filterToggleShown = (active: boolean, fileCount: number): boolean => active || fileCount > 1;

/** A toggle click on an active filter clears and closes it; otherwise it opens the row. */
export function toggleFilter(open: boolean, query: string): { open: boolean; query: string } {
  return filterActive(open, query) ? { open: false, query: "" } : { open: true, query };
}
