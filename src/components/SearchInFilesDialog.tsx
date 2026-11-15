// Search in files dialog (⌘⇧F, `nav.searchInFiles`): live-grep across the
// current workspace. REA evidence: renderApp-D_fmY7hW.js offsets 7427975–7435900
// (functions $co, zco, Hco, Vco, fwt, Wco, Gco, qco, Kco, Yco; dialog id _Se).
//
// Conductor layout (from REA evidence):
//   • max-w-2xl max-h-[70vh] dialog positioned at top-2
//   • Input: placeholder "Search in files..."
//   • Toggle row: "Match case" / "Whole word" / "Regular expression" + match count
//   • Results grouped by file: file icon + filename + dir + match count
//   • Match rows: monospace font-size 12px, left-pad 28px, highlighted submatches
//   • 150ms debounce on query
//   • On pick: addRecentFile + onOpen({path, lineNumber}) + onClose

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { grepWorkspace, type GrepMatch, type GrepResult } from "../backend";
import { RECENT_FILES_STORAGE_KEY, addRecentFile, parseRecentFiles } from "../spotlight/recentFiles";
import { ConductorIcon } from "./ConductorIcon";
import { useDialogMotion } from "./motion/dialogMotion";

// --- Icons (Lucide geometries, inline — not in the shared icon set) ---

/** Lucide `case-sensitive` (aA): match-case toggle. */
function CaseSensitiveIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 15 4-8 4 8" />
      <path d="M4 13h6" />
      <circle cx="18" cy="12" r="3" />
      <path d="M21 9v6" />
    </svg>
  );
}

/** Lucide `whole-word`: whole-word toggle. */
function WholeWordIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7" cy="12" r="3" />
      <path d="M10 9v6" />
      <circle cx="17" cy="12" r="3" />
      <path d="M14 7v8" />
      <path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1" />
    </svg>
  );
}

/** Lucide `regex`: regular-expression toggle. */
function RegexIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3v10" />
      <path d="m12.67 5.5 8.66 5" />
      <path d="m12.67 10.5 8.66-5" />
      <path d="M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z" />
    </svg>
  );
}

// --- Debounce hook (Fco = 150ms in Conductor) ---

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// --- Options state (Bco initial values) ---

interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex: boolean;
}

const DEFAULT_OPTIONS: SearchOptions = { caseSensitive: false, wholeWord: false, isRegex: false };

// --- Match count (Wco) ---

function matchCount(result: GrepResult | null, hasQuery: boolean): string | null {
  if (!hasQuery || !result || result.matches.length === 0) return null;
  const files = new Set(result.matches.map((m) => m.relative_path)).size;
  const n = result.matches.length;
  const matchWord = n === 1 ? "match" : "matches";
  const fileWord = files === 1 ? "file" : "files";
  return result.truncated ? `First ${n} matches in ${files} ${fileWord}` : `${n} ${matchWord} in ${files} ${fileWord}`;
}

// --- Empty/loading state (Gco) ---

function emptyState(hasQuery: boolean, isFetching: boolean, error: Error | null, result: GrepResult | null): string | null {
  if (error) return error.message;
  if (!hasQuery) return "Type to search file contents";
  if (isFetching) return "Searching...";
  if (!result || result.matches.length === 0) return "No matches";
  return null;
}

// --- File group: { relativePath, fileName, matches } ---

interface FileGroup {
  relativePath: string;
  fileName: string;
  matches: GrepMatch[];
}

function groupByFile(result: GrepResult | null): FileGroup[] {
  if (!result) return [];
  const map = new Map<string, FileGroup>();
  for (const m of result.matches) {
    const existing = map.get(m.relative_path);
    if (existing) {
      existing.matches.push(m);
    } else {
      map.set(m.relative_path, {
        relativePath: m.relative_path,
        fileName: m.relative_path.split("/").pop() ?? m.relative_path,
        matches: [m],
      });
    }
  }
  return [...map.values()];
}

// --- Highlighted match line (Yco) ---

function HighlightedLine({ match }: { match: GrepMatch }) {
  const trimmed = match.line_text.trimStart();
  const offset = match.line_text.length - trimmed.length;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const sub of match.submatches) {
    const start = Math.max(sub.start - offset, 0);
    const end = Math.max(sub.end - offset, 0);
    if (start > cursor) parts.push(<span key={`t${cursor}`}>{trimmed.slice(cursor, start)}</span>);
    parts.push(
      <mark key={`m${start}`} className="sif-mark">
        {trimmed.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < trimmed.length) parts.push(<span key={`t${cursor}`}>{trimmed.slice(cursor)}</span>);
  return <span className="sif-line-text">{parts}</span>;
}

// --- File heading row (Kco) ---

function FileHeading({ group }: { group: FileGroup }) {
  const dir = group.relativePath.slice(0, group.relativePath.length - group.fileName.length);
  return (
    <div className="sif-file-heading">
      <ConductorIcon name="file" size={12} />
      <span className="sif-filename">{group.fileName}</span>
      {dir && <span className="sif-dir">{dir}</span>}
      <span className="sif-file-count">{group.matches.length}</span>
    </div>
  );
}

// --- Toggle button (fwt) ---

function ToggleButton({
  pressed,
  label,
  onToggle,
  children,
}: {
  pressed: boolean;
  label: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`sif-toggle${pressed ? " sif-toggle--on" : ""}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}

// --- Props ---

export interface SearchInFilesDialogProps {
  repoId: string;
  workspacePath: string | null;
  onClose: () => void;
  onOpen: (relativePath: string, lineNumber: number) => void;
}

// --- Main component ---

export function SearchInFilesDialog({ repoId, workspacePath, onClose, onOpen }: SearchInFilesDialogProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<GrepResult | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [recents, setRecents] = useState(() => parseRecentFiles(localStorage.getItem(RECENT_FILES_STORAGE_KEY)));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const motionRef = useDialogMotion<HTMLDivElement>();

  // 150ms debounce (Fco)
  const debouncedQuery = useDebounced(query, 150);

  // Run grep on debounced query + options change
  useEffect(() => {
    if (!workspacePath || !debouncedQuery.trim()) {
      setResult(null);
      setIsFetching(false);
      setError(null);
      return;
    }
    let live = true;
    setIsFetching(true);
    setError(null);
    grepWorkspace(workspacePath, debouncedQuery, options)
      .then((r) => {
        if (!live) return;
        setResult(r);
        setIsFetching(false);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setIsFetching(false);
      });
    return () => {
      live = false;
    };
  }, [workspacePath, debouncedQuery, options]);

  // Show "Searching..." optimistically when user is typing
  const showFetching = isFetching || (query !== debouncedQuery && query.trim().length > 0);

  const hasQuery = debouncedQuery.trim().length > 0;
  const groups = groupByFile(result);
  const count = matchCount(result, hasQuery);
  const empty = emptyState(hasQuery, showFetching, error, result);

  function pick(match: GrepMatch) {
    const next = addRecentFile(recents, { repositoryId: repoId, path: match.relative_path, timestamp: Date.now() });
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(next));
    setRecents(next);
    onOpen(match.relative_path, match.line_number);
    onClose();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="modal-backdrop sif-backdrop"
      ref={motionRef}
      data-dialog-motion="cmdk"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal sif" role="dialog" aria-modal="true" aria-label="Search in files">
        {/* Input row */}
        <input
          ref={inputRef}
          className="sif-input"
          autoFocus
          placeholder="Search in files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />

        {/* Options + count row */}
        <div className="sif-options-row">
          <ToggleButton pressed={options.caseSensitive} label="Match case" onToggle={() => setOptions((o) => ({ ...o, caseSensitive: !o.caseSensitive }))}>
            <CaseSensitiveIcon />
          </ToggleButton>
          <ToggleButton pressed={options.wholeWord} label="Whole word" onToggle={() => setOptions((o) => ({ ...o, wholeWord: !o.wholeWord }))}>
            <WholeWordIcon />
          </ToggleButton>
          <ToggleButton pressed={options.isRegex} label="Regular expression" onToggle={() => setOptions((o) => ({ ...o, isRegex: !o.isRegex }))}>
            <RegexIcon />
          </ToggleButton>
          {count && <span className="sif-count">{count}</span>}
        </div>

        {/* Results */}
        <div className="sif-results" ref={listRef}>
          {empty ? (
            <div className="sif-empty">{empty}</div>
          ) : (
            groups.map((group) => (
              <div key={group.relativePath} className="sif-group">
                <FileHeading group={group} />
                {group.matches.map((match) => (
                  <button
                    key={`${match.relative_path}:${match.line_number}`}
                    type="button"
                    className="sif-match-row"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(match)}
                  >
                    <HighlightedLine match={match} />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
