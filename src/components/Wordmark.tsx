import { LogoMark } from "./Icons";

/**
 * Centered Home wordmark: our mark plus the product name, drawn in currentColor so it
 * follows light and dark themes. Decorative only (the window title names the app).
 * Sizing mirrors the reference layout: a 96px-tall box, at most 627px wide.
 */
export function Wordmark() {
  return (
    <div className="wordmark" aria-hidden="true">
      <LogoMark size={56} />
      <span className="wordmark-text">OpenConductor</span>
    </div>
  );
}
