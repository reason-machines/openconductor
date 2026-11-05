// parity:diff.whitespace:ui
// Conductor's whitespace controls in the diff file view (evidence/diff/whitespace.md):
// an icon toggle in the file toolbar whose label says what a click does
// ("Hide whitespace changes" / "Show whitespace changes"), and, for a file
// whose changes are all whitespace while they are hidden, an empty state
// with a link that shows them again.

const WhitespaceIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.5 9.5v2h11v-2" />
    <path d="M5 4.5h6M8 4.5v4" />
  </svg>
);

export const whitespaceLabel = (hidden: boolean): string => (hidden ? "Show whitespace changes" : "Hide whitespace changes");

/** File-toolbar toggle; pressed while whitespace changes are hidden. */
export function WhitespaceToggle({ hidden, onChange }: { hidden: boolean; onChange: (hidden: boolean) => void }) {
  const label = whitespaceLabel(hidden);
  return (
    <span className="oc-seg oc-icons">
      <button aria-pressed={hidden} onClick={() => onChange(!hidden)} title={label} aria-label={label}>
        <WhitespaceIcon />
      </button>
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
