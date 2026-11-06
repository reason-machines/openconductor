/**
 * The empty "Create from" trigger's two overlapping 16px avatars (Conductor's
 * `o7i`: "flex -space-x-1", a Linear mark then a GitHub mark on a foreground
 * disc, each with a 1px background border). Conductor ships its own image
 * files; these are drawn here: Lucide's `github` glyph (ISC) and a plain
 * Linear-coloured disc with its three diagonal bars.
 */
export function ProviderMarks() {
  return (
    <span className="create-provider-marks" aria-hidden>
      <span className="create-provider-mark create-provider-linear">
        <svg viewBox="0 0 16 16" width="14" height="14">
          <circle cx="8" cy="8" r="8" fill="var(--brand-linear)" />
          <path d="M3 9.5 6.5 13M3 6.5 9.5 13M4.5 4.5l7 7" stroke="var(--on-solid)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="create-provider-mark create-provider-github">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      </span>
    </span>
  );
}
