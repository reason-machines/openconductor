// Draws the "Workspace status matrix" indicator (Conductor's `fJo`); the
// model in src/state/statusMatrix.ts decides which dots light and how.
import { useId, type CSSProperties } from "react";
import {
  AUTOMATION_ARROW_CELLS,
  AUTOMATION_STATIC_CELLS,
  ERROR_CELLS,
  FULL_PATH,
  MATRIX_AREA,
  MATRIX_DOT,
  MATRIX_INSET,
  MERGED_CELLS,
  statusMatrix,
  type MatrixInput,
} from "../state/statusMatrix";
import "./statusMatrix.css";

const OPACITY = { 1: "1", 0.5: "50", 0.32: "32" } as const;

export function StatusMatrix(props: MatrixInput) {
  const m = statusMatrix(props);
  const clipId = useId();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={m.label}
      data-testid="workspace-status-matrix"
      data-activity={m.activity}
      data-status={props.status}
      className="oc-matrix"
      data-color={m.color}
      data-dimmed={m.dimmed || undefined}
    >
      <path d={m.base.path} data-testid="workspace-status-matrix-base" className="oc-matrix-base" data-color={m.base.color} data-opacity={OPACITY[m.base.opacity]} />
      {m.merged && (
        <g className="oc-matrix-current" data-testid="workspace-status-matrix-merged-pattern">
          {MERGED_CELLS.map((c) => (
            <rect key={c.index} height={MATRIX_DOT} width={MATRIX_DOT} x={c.x} y={c.y} />
          ))}
        </g>
      )}
      {m.error && (
        <g className="oc-matrix-current" data-color="destructive" data-testid="workspace-status-matrix-error-pattern">
          {ERROR_CELLS.map((c) => (
            <rect key={c.index} height={MATRIX_DOT} width={MATRIX_DOT} x={c.x} y={c.y} />
          ))}
        </g>
      )}
      {m.attention && (
        <path
          d={FULL_PATH}
          data-paused={m.paused || undefined}
          data-status={props.status}
          data-testid="workspace-status-matrix-overlay"
          className="workspace-matrix-attention oc-matrix-foreground"
        />
      )}
      {m.automation && (
        <g clipPath={`url(#${clipId})`} data-status={props.status} data-testid="workspace-status-matrix-overlay">
          <defs>
            <clipPath id={clipId}>
              <rect height={MATRIX_AREA} width={MATRIX_AREA} x={MATRIX_INSET} y={MATRIX_INSET} />
            </clipPath>
          </defs>
          <g className="workspace-matrix-automation-arrow oc-matrix-foreground" data-paused={m.paused || undefined} data-testid="workspace-status-matrix-automation-arrow">
            {AUTOMATION_ARROW_CELLS.map((c, i) => (
              <rect key={i} height={MATRIX_DOT} width={MATRIX_DOT} x={c.x} y={c.y} />
            ))}
          </g>
          <g className="workspace-matrix-automation-arrow-static oc-matrix-foreground" data-paused={m.paused || undefined}>
            {AUTOMATION_STATIC_CELLS.map((c, i) => (
              <rect key={i} height={MATRIX_DOT} width={MATRIX_DOT} x={c.x} y={c.y} />
            ))}
          </g>
        </g>
      )}
      {m.overlay && (
        <g data-status={props.status} data-testid="workspace-status-matrix-overlay">
          {m.overlay.map((c) => (
            <rect
              key={`${c.x}-${c.y}`}
              x={c.x}
              y={c.y}
              width={c.size}
              height={c.size}
              data-reduced-highlight={c.reducedHighlight || undefined}
              data-waiting-static={c.waitingStatic || undefined}
              data-setup-corner={c.setupCorner || undefined}
              data-lit={c.lit || undefined}
              style={c.style as CSSProperties}
              className={["oc-matrix-cell", c.foreground ? "oc-matrix-foreground" : "oc-matrix-current", c.animation && `workspace-matrix-${c.animation}`].filter(Boolean).join(" ")}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
