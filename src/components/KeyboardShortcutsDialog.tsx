// "Keyboard shortcuts" help dialog (openKeyboardShortcuts, ⌥⌘/). Layout,
// copy and search follow evidence/keybindings/README.md ("Help dialog");
// the data comes from src/keybindings/help.ts.
import { useMemo, useState } from "react";
import {
  HELP_DIALOG_TITLE,
  HELP_SEARCH_PLACEHOLDER,
  groupRows,
  helpRows,
  highlightSegments,
  noResultsText,
  searchRows,
  type HelpRow,
} from "../keybindings/help.ts";
import type { Overrides } from "../keybindings/overrides.ts";
import { partGlyph, shortcutParts, spoken } from "../keybindings/shortcut.ts";
import type { Shortcut } from "../keybindings/types.ts";
import { CloseIcon, KeyboardIcon, SearchIcon } from "./Icons";
import { useDialogMotion } from "./motion/dialogMotion";

export const KEYBOARD_SHORTCUTS_DIALOG_ID = "keyboard-shortcuts-dialog";

export function Keys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="ks-keys" aria-label={spoken([shortcut])}>
      {shortcutParts(shortcut).map((part, i) => (
        <kbd key={i} aria-hidden="true">{partGlyph(part)}</kbd>
      ))}
    </span>
  );
}

/** Title with matched characters at full strength and the rest dimmed. */
function Title({ text, indexes, hasQuery }: { text: string; indexes?: readonly number[]; hasQuery: boolean }) {
  if (!hasQuery) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, indexes ?? []).map((s, i) => (
        <span key={i} className={s.matched ? undefined : "ks-dim"}>{s.text}</span>
      ))}
    </>
  );
}

function Row({ row, titleIndexes, hasQuery }: { row: HelpRow; titleIndexes?: readonly number[]; hasQuery: boolean }) {
  return (
    <div className="ks-row" data-command-id={row.id}>
      <span className="ks-title"><Title text={row.title} indexes={titleIndexes} hasQuery={hasQuery} /></span>
      <span className="ks-shortcuts">
        {row.shortcuts.map((s, i) => (
          <span key={i} className="ks-alt">
            {i > 0 && <span className="ks-or">or</span>}
            <Keys shortcut={s} />
          </span>
        ))}
      </span>
    </div>
  );
}

export function KeyboardShortcutsDialog({ onClose, overrides = {} }: { onClose: () => void; overrides?: Overrides }) {
  const [query, setQuery] = useState("");
  const rows = useMemo(() => helpRows(overrides), [overrides]);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const results = useMemo(() => searchRows(rows, query), [rows, query]);
  const ref = useDialogMotion<HTMLDivElement>();

  return (
    <div className="modal-backdrop" ref={ref} data-dialog-motion="dialog" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal ks-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={HELP_DIALOG_TITLE}
        data-dialog-id={KEYBOARD_SHORTCUTS_DIALOG_ID}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="modal-header">
          <h2 className="ks-heading"><KeyboardIcon size={20} />{HELP_DIALOG_TITLE}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="ks-search">
          <SearchIcon size={16} />
          <input autoFocus placeholder={HELP_SEARCH_PLACEHOLDER} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="ks-body">
          {results === undefined ? (
            groups.map((g) => (
              <section key={g.category}>
                <h3>{g.category}</h3>
                <div className="ks-list">{g.rows.map((r) => <Row key={r.id} row={r} hasQuery={false} />)}</div>
              </section>
            ))
          ) : results.length > 0 ? (
            <div className="ks-list">
              {results.map((m) => <Row key={m.row.id} row={m.row} titleIndexes={m.titleIndexes} hasQuery={m.titleIndexes !== undefined} />)}
            </div>
          ) : (
            <div className="ks-empty">{noResultsText(query)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
