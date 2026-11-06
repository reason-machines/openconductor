import { BAR_HEIGHT, CORNER_RADIUS, pixelWordmark } from "../home/pixelWordmark";

const MARK = pixelWordmark("OPENCONDUCTOR");

/**
 * Centred Home wordmark: OPENCONDUCTOR in the pixel style of Conductor's
 * CONDUCTOR mark (src/home/pixelWordmark.ts), drawn in currentColor so it
 * follows light and dark themes. Decorative only, like Conductor's `Xgi`, and in
 * the same box: `h-24`, full width up to 627px. Our 13 letters are wider than
 * CONDUCTOR's 9, so the blocks come out smaller than Conductor's.
 */
export function Wordmark() {
  return (
    <div className="wordmark" aria-hidden="true">
      <svg
        className="wordmark-svg"
        viewBox={`0 0 ${MARK.width} ${MARK.height}`}
        fill="currentColor"
        focusable="false"
      >
        {MARK.bars.map((b) => (
          <rect key={`${b.x},${b.y}`} x={b.x} y={b.y} width={b.width} height={BAR_HEIGHT} rx={CORNER_RADIUS} />
        ))}
      </svg>
    </div>
  );
}
