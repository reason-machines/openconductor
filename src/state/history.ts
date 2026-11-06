// Back/forward history for the sidebar arrows and nav.back / nav.forward.
// Conductor moves through its router history (history.go(-1) / go(1)); OpenConductor
// has no router, so the history is the list of selections the user visited.
// Pure so node --test can cover it.
import type { Selection } from "./types";

export interface NavHistory {
  entries: Selection[];
  index: number;
}

const LIMIT = 100;

export const sameSelection = (a: Selection, b: Selection): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === "workspace") return b.kind === "workspace" && a.workspaceId === b.workspaceId && a.repoId === b.repoId;
  if (a.kind === "routines") return b.kind === "routines" && JSON.stringify(a.page ?? null) === JSON.stringify(b.page ?? null);
  return true;
};

export const startHistory = (sel: Selection): NavHistory => ({ entries: [sel], index: 0 });

/** Record a visit. Visiting the current entry is a no-op; a new visit drops the forward entries. */
export function visit(h: NavHistory, sel: Selection): NavHistory {
  if (sameSelection(h.entries[h.index], sel)) return h;
  const entries = [...h.entries.slice(0, h.index + 1), sel].slice(-LIMIT);
  return { entries, index: entries.length - 1 };
}

export const canGoBack = (h: NavHistory): boolean => h.index > 0;
export const canGoForward = (h: NavHistory): boolean => h.index < h.entries.length - 1;

/** Step by -1 (back) or +1 (forward); stays put at either end. */
export function step(h: NavHistory, delta: -1 | 1): NavHistory {
  const index = Math.min(Math.max(h.index + delta, 0), h.entries.length - 1);
  return index === h.index ? h : { ...h, index };
}

export const current = (h: NavHistory): Selection => h.entries[h.index];

/** Drop entries that point at workspaces that no longer exist (archived or removed). */
export function prune(h: NavHistory, exists: (sel: Selection) => boolean): NavHistory {
  const keep = h.entries.map((s, i) => ({ s, i })).filter(({ s }) => exists(s));
  if (keep.length === h.entries.length) return h;
  if (keep.length === 0) return startHistory({ kind: "root" });
  const before = keep.filter(({ i }) => i <= h.index).length;
  return { entries: keep.map(({ s }) => s), index: Math.max(before - 1, 0) };
}
