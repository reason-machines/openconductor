// Sidebar row status icons. Shapes come from Conductor's `WXo` table (REA, read
// as data); busy statuses draw a small animated loader in their place (`RCe`).
import type { ReactNode } from "react";
import { isBusyStatus, type RowStatus } from "../state/rowStatus";

type Node =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "line"; x1: number; x2: number; y1: number; y2: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; rx: number }
  | { kind: "path"; d: string };

interface Shape {
  nodes: Node[];
  /** Filled 16x16 glyph instead of a 24x24 outline. */
  filled?: boolean;
}

const c = (cx: number, cy: number, r: number): Node => ({ kind: "circle", cx, cy, r });
const p = (d: string): Node => ({ kind: "path", d });
const l = (x1: number, y1: number, x2: number, y2: number): Node => ({ kind: "line", x1, x2, y1, y2 });

const ALERT: Shape = { nodes: [c(12, 12, 10), l(12, 8, 12, 12), l(12, 16, 12.01, 16)] };
const PULL: Shape = { nodes: [c(18, 18, 3), c(6, 6, 3), p("M13 6h3a2 2 0 0 1 2 2v7"), l(6, 9, 6, 21)] };
// REA LXo/WXo, renderApp 5199d392…; Sven requests the branch glyph for local rows too.
// Reference rules and the deliberate local-row override: evidence/sidebar-pr-icons/README.md.
const BRANCH: Shape = { nodes: [p("M15 6a9 9 0 0 0-9 9V3"), c(18, 6, 3), c(6, 18, 3)] };

const SHAPES: Partial<Record<RowStatus, Shape>> = {
  unstarted: { nodes: [c(12, 12, 9)] },
  failed: ALERT,
  "needs-plan-response": {
    nodes: [
      { kind: "rect", x: 8, y: 2, width: 8, height: 4, rx: 1 },
      p("M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"),
      p("M12 11h4"),
      p("M12 16h4"),
      p("M8 11h.01"),
      p("M8 16h.01"),
    ],
  },
  "needs-user-permission": ALERT,
  "needs-user-input": {
    nodes: [
      p("M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"),
      p("M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"),
      p("M12 17h.01"),
    ],
  },
  merged: { nodes: [c(18, 18, 3), c(6, 6, 3), p("M6 21V9a9 9 0 0 0 9 9")] },
  "merge-queued": {
    filled: true,
    nodes: [
      p(
        "M3.75 4.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM3 7.75a.75.75 0 0 1 1.5 0v2.878a2.251 2.251 0 1 1-1.5 0Zm.75 5.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm5-7.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm5.75 2.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-1.5 0a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z",
      ),
    ],
  },
  "ready-to-merge": { nodes: [c(5, 6, 3), p("M5 9v12"), c(19, 18, 3), p("m15 9-3-3 3-3"), p("M12 6h5a2 2 0 0 1 2 2v7")] },
  "draft-pr": { nodes: [c(18, 18, 3), c(6, 6, 3), p("M18 6V5"), p("M18 11v-1"), l(6, 9, 6, 21)] },
  "merge-conflict": { nodes: [p("M12 6h4a2 2 0 0 1 2 2v7"), p("M6 12v9"), p("M9 3 3 9"), p("M9 9 3 3"), c(18, 18, 3)] },
  "checks-failing": { nodes: [p("M18 6 6 18"), p("m6 6 12 12")] },
  "checks-pending": PULL,
  "open-pr": PULL,
  local: BRANCH,
  branch: BRANCH,
};

function draw(n: Node, key: number): ReactNode {
  switch (n.kind) {
    case "circle":
      return <circle key={key} cx={n.cx} cy={n.cy} r={n.r} />;
    case "line":
      return <line key={key} x1={n.x1} x2={n.x2} y1={n.y1} y2={n.y2} />;
    case "rect":
      return <rect key={key} x={n.x} y={n.y} width={n.width} height={n.height} rx={n.rx} ry={n.rx} />;
    case "path":
      return <path key={key} d={n.d} />;
  }
}

/** Three dots that pulse in turn: the agent is working, setting up or waiting. */
function Loader({ size }: { size: number }) {
  return (
    <svg className="sb-ws-loader" width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="3" cy="8" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="13" cy="8" r="1.5" />
    </svg>
  );
}

export function RowStatusIcon({ status, size = 14 }: { status: RowStatus; size?: number }) {
  if (isBusyStatus(status)) return <Loader size={size} />;
  const shape = SHAPES[status];
  if (!shape) return null;
  return shape.filled ? (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true">
      {shape.nodes.map(draw)}
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shape.nodes.map(draw)}
    </svg>
  );
}
