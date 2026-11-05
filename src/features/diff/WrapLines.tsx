// parity:diff.file-render:ui
// Conductor's Wrap lines toggle in the file toolbar (REA read of renderApp,
// 0.87.6): an icon button beside the whitespace toggle, offered for text files,
// labelled with what a click does ("Wrap lines" / "Don't wrap lines") and
// pressed while lines wrap. It drives the wrap_lines setting, on by default.

export const wrapLabel = (wrap: boolean): string => (wrap ? "Don't wrap lines" : "Wrap lines");

const WrapIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2.5 4h11" />
    <path d="M2.5 8h9a2 2 0 0 1 0 4H8.5" />
    <path d="M10 10.5 8.5 12l1.5 1.5" />
    <path d="M2.5 12h3" />
  </svg>
);

export function WrapToggle({ wrap, onChange }: { wrap: boolean; onChange: (wrap: boolean) => void }) {
  const label = wrapLabel(wrap);
  return (
    <span className="oc-seg oc-icons">
      <button aria-pressed={wrap} onClick={() => onChange(!wrap)} title={label} aria-label={label}>
        <WrapIcon />
      </button>
    </span>
  );
}
