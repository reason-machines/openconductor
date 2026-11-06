// parity:diff.whitespace:ui
// Conductor's whitespace controls in the diff file view (evidence/diff/whitespace.md).
// With the Pierre renderer (the one we use) its file toolbar carries a "View
// options" icon button whose non-modal menu has checkbox items "Hide whitespace
// changes" and, when line wrapping is offered, "Wrap lines". A file whose
// changes are all whitespace, while they are hidden, shows an empty state with
// a link that shows them again.
import { useEffect, useRef, useState } from "react";
import { usePresence } from "../../components/motion/usePresence.ts";

const WhitespaceIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.5 9.5v2h11v-2" />
    <path d="M5 4.5h6M8 4.5v4" />
  </svg>
);

const OptionsIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    <circle cx="5.5" cy="4.5" r="1.2" fill="var(--oc-diff-bg-gutter, Canvas)" />
    <circle cx="10.5" cy="8" r="1.2" fill="var(--oc-diff-bg-gutter, Canvas)" />
    <circle cx="7" cy="11.5" r="1.2" fill="var(--oc-diff-bg-gutter, Canvas)" />
  </svg>
);

const Check = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export const VIEW_OPTIONS_LABEL = "View options";
export const HIDE_WHITESPACE_LABEL = "Hide whitespace changes";
export const WRAP_LINES_LABEL = "Wrap lines";

export interface ViewOptionsProps {
  whitespace?: { hidden: boolean; onChange: (hidden: boolean) => void };
  textWrap?: { wrapLines: boolean; onChange: (wrap: boolean) => void };
}

/** File-toolbar "View options" menu; renders nothing when it has no items, as in Conductor. */
export function ViewOptionsMenu({ whitespace, textWrap }: ViewOptionsProps) {
  const [open, setOpen] = useState(false);
  const presence = usePresence(open);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!whitespace && !textWrap) return null;
  const item = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className="oc-view-option" onClick={() => onChange(!checked)}>
      <span className="label">{label}</span>
      <span className="check">{checked && <Check />}</span>
    </button>
  );
  return (
    <span ref={ref} className="oc-view-options">
      <button
        type="button"
        className="icon-btn"
        aria-label={VIEW_OPTIONS_LABEL}
        title={VIEW_OPTIONS_LABEL}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <OptionsIcon />
      </button>
      {presence.mounted && (
        <div className="oc-view-options-menu" data-motion="popup" {...presence.attrs} role="menu" aria-label={VIEW_OPTIONS_LABEL}>
          {whitespace && item(HIDE_WHITESPACE_LABEL, whitespace.hidden, whitespace.onChange)}
          {textWrap && item(WRAP_LINES_LABEL, textWrap.wrapLines, textWrap.onChange)}
        </div>
      )}
    </span>
  );
}

/** Shown instead of the code when every change in the file is whitespace and whitespace is hidden. */
export function WhitespaceOnly({ onShow }: { onShow?: () => void }) {
  return (
    <div className="oc-file-note oc-whitespace-only">
      <WhitespaceIcon />
      <p>Only whitespace changes found</p>
      {onShow && (
        <button className="link-btn" onClick={onShow}>
          Show whitespace changes
        </button>
      )}
    </div>
  );
}
