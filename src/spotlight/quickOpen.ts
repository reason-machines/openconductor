// Quick open (⌘P, `nav.quickOpen`) list model and keyboard flow, kept free of
// React and the DOM so node --test covers it.
//
// Evidence (evidence/quick_open/NOTES.md, evidence/search-palette/README.md):
// results come from the Rust `fuzzy_filter_files` command already ranked;
// the list is a cmdk list with `loop: true`; Enter opens the file, ⌘Enter
// opens its diff; Escape closes; empty states depend on loading and query.
// Ctrl+N / Ctrl+P mirror cmdk's default vim-style bindings (inferred from
// Conductor using cmdk, not observed directly).

import type { RecentFile } from "./recentFiles.ts";

/** Result shape of `fuzzy_filter_files` (src-tauri/src/quick_open). */
export interface FileMatch {
  file: { name: string; path: string; is_directory: boolean };
  score: number;
  /** UTF-16 offsets into `relative_path`. */
  match_indices: number[];
  relative_path: string;
}

export interface QuickOpenRow {
  /** Workspace-relative path; also the row's identity. */
  relativePath: string;
  indices: readonly number[];
  recent: boolean;
}

/**
 * Rows to show. With an empty query, recent files for this repository come
 * first, then the backend's default list without duplicates. With a query,
 * only the backend's ranked matches.
 */
export function buildRows(query: string, results: readonly FileMatch[], recents: readonly RecentFile[]): QuickOpenRow[] {
  const rows: QuickOpenRow[] = [];
  const seen = new Set<string>();
  if (query.trim() === "") {
    for (const r of recents) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      rows.push({ relativePath: r.path, indices: [], recent: true });
    }
  }
  for (const m of results) {
    if (seen.has(m.relative_path)) continue;
    seen.add(m.relative_path);
    rows.push({ relativePath: m.relative_path, indices: m.match_indices, recent: false });
  }
  return rows;
}

/** Empty-state text, or null when there are rows to show. */
export function emptyMessage(query: string, loading: boolean, rowCount: number): string | null {
  if (rowCount > 0) return null;
  const hasQuery = query.trim() !== "";
  if (loading) return hasQuery ? "Searching files..." : "Loading files...";
  return hasQuery ? "No files found" : "No files available";
}

export interface Segment {
  text: string;
  match: boolean;
}

/** Split `text` into matched / unmatched runs for highlighting. */
export function highlight(text: string, indices: readonly number[]): Segment[] {
  const hit = new Set(indices);
  const out: Segment[] = [];
  for (let i = 0; i < text.length; i++) {
    const match = hit.has(i);
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += text[i];
    else out.push({ text: text[i], match });
  }
  return out;
}

/** Split a relative path into directory and file name for two-tone display. */
export function splitPath(relativePath: string): { dir: string; name: string } {
  const at = relativePath.lastIndexOf("/");
  return at < 0 ? { dir: "", name: relativePath } : { dir: relativePath.slice(0, at + 1), name: relativePath.slice(at + 1) };
}

/** Next selected index; wraps around at both ends (cmdk `loop`). */
export function moveSelection(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type QuickOpenKey =
  | { kind: "move"; delta: 1 | -1 }
  | { kind: "edge"; to: "first" | "last" }
  | { kind: "open"; mode: "file" | "diff" }
  | { kind: "close" };

/** What a key press inside the quick open input does, or null to let it type. */
export function quickOpenKey(e: KeyLike): QuickOpenKey | null {
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  if (e.key === "ArrowDown" && plain) return { kind: "move", delta: 1 };
  if (e.key === "ArrowUp" && plain) return { kind: "move", delta: -1 };
  if (e.ctrlKey && !e.metaKey && (e.key === "n" || e.key === "j")) return { kind: "move", delta: 1 };
  if (e.ctrlKey && !e.metaKey && (e.key === "p" || e.key === "k")) return { kind: "move", delta: -1 };
  if (e.key === "Home" && plain) return { kind: "edge", to: "first" };
  if (e.key === "End" && plain) return { kind: "edge", to: "last" };
  if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.shiftKey) return { kind: "open", mode: e.metaKey ? "diff" : "file" };
  if (e.key === "Escape") return { kind: "close" };
  return null;
}
