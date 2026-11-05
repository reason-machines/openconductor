// Quick open file (⌘P, `nav.quickOpen`): type to fuzzy-find a file in the
// current workspace. Ranking happens in Rust (`fuzzy_filter_files`); this
// component renders rows and runs the keyboard flow from src/spotlight.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { fuzzyFilterFiles } from "../backend";
import {
  buildRows,
  emptyMessage,
  highlight,
  moveSelection,
  quickOpenKey,
  splitPath,
  type FileMatch,
  type QuickOpenRow,
} from "../spotlight/quickOpen";
import {
  RECENT_FILES_STORAGE_KEY,
  addRecentFile,
  getRecentFiles,
  parseRecentFiles,
} from "../spotlight/recentFiles";
import { FileIcon } from "./Icons";

export const QUICK_OPEN_DIALOG_ID = "quick-open-dialog";

export type OpenMode = "file" | "diff";

interface Props {
  repoId: string;
  /** Directory to search; null when the workspace has no files on disk yet. */
  workspacePath: string | null;
  onClose: () => void;
  onOpen: (relativePath: string, mode: OpenMode) => void;
}

function Highlighted({ text, indices, offset }: { text: string; indices: readonly number[]; offset: number }) {
  const shifted = indices.map((i) => i - offset).filter((i) => i >= 0 && i < text.length);
  return (
    <>
      {highlight(text, shifted).map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function Row(props: { id: string; row: QuickOpenRow; selected: boolean; onHover: () => void; onPick: () => void }) {
  const { id, row, selected, onHover, onPick } = props;
  const { dir, name } = splitPath(row.relativePath);
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      data-selected={selected}
      className="qo-row"
      onMouseMove={onHover}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      <FileIcon size={14} />
      <span className="qo-name">
        <Highlighted text={name} indices={row.indices} offset={dir.length} />
      </span>
      <span className="qo-dir">
        <Highlighted text={dir} indices={row.indices} offset={0} />
      </span>
      {row.recent && <span className="qo-tag">Recent</span>}
    </li>
  );
}

export function QuickOpenDialog({ repoId, workspacePath, onClose, onOpen }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);
  const [recents, setRecents] = useState(() => parseRecentFiles(localStorage.getItem(RECENT_FILES_STORAGE_KEY)));
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (workspacePath === null) {
      setResults([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    fuzzyFilterFiles(workspacePath, query, true)
      .then((r) => live && setResults(r))
      .catch(() => live && setResults([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [workspacePath, query]);

  const rows = useMemo(() => buildRows(query, results, getRecentFiles(recents, repoId)), [query, results, recents, repoId]);
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected, rows]);

  function pick(row: QuickOpenRow | undefined, mode: OpenMode) {
    if (!row) return;
    const next = addRecentFile(recents, { repositoryId: repoId, path: row.relativePath, timestamp: Date.now() });
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(next));
    setRecents(next);
    onOpen(row.relativePath, mode);
    onClose();
  }

  function onKeyDown(e: KeyboardEvent) {
    const k = quickOpenKey(e);
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    if (k.kind === "move") setSelected((i) => moveSelection(i, k.delta, rows.length));
    else if (k.kind === "edge") setSelected(k.to === "first" ? 0 : Math.max(rows.length - 1, 0));
    else if (k.kind === "open") pick(rows[selected], k.mode);
    else onClose();
  }

  const empty = workspacePath === null ? "No files available" : emptyMessage(query, loading, rows.length);
  return (
    <div className="modal-backdrop qo-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal qo" role="dialog" aria-modal="true" aria-label="Quick open file" id={QUICK_OPEN_DIALOG_ID}>
        <input
          className="qo-input"
          autoFocus
          placeholder="Search files..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-controls="qo-list"
          aria-activedescendant={rows.length ? `qo-${selected}` : undefined}
        />
        {empty ? (
          <div className="qo-empty">{empty}</div>
        ) : (
          <ul className="qo-list" id="qo-list" role="listbox" ref={listRef}>
            {rows.map((row, i) => (
              <Row key={row.relativePath} id={`qo-${i}`} row={row} selected={i === selected} onHover={() => setSelected(i)} onPick={() => pick(row, "file")} />
            ))}
          </ul>
        )}
        <div className="qo-hint">↑↓ navigate · ↵ file · ⌘↵ diff · esc close</div>
      </div>
    </div>
  );
}
