import { buildPixelWordmark, pixelWordmarkPath } from "./pixelWordmark";

const MARK = buildPixelWordmark("OPENCONDUCTOR");
const PATH = pixelWordmarkPath(MARK);

/**
 * Centered Home wordmark: OpenConductor's pixel lettering in currentColor, so it follows
 * light and dark themes. Sized like the reference layout: at most 627px wide, 96px box.
 */
export function Wordmark() {
  return (
    <div className="wordmark">
      <svg
        role="img"
        aria-label="OpenConductor"
        viewBox={`0 0 ${MARK.cols} ${MARK.rows}`}
        className="wordmark-svg"
        shapeRendering="crispEdges"
      >
        <path d={PATH} fill="currentColor" />
      </svg>
    </div>
  );
}
