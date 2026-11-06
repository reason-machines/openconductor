// The "Workspace status matrix" indicator (Settings › Experimental,
// `internal_workspace_status_matrix`): a 16×16 icon of 4×4 dots that stands in
// for the row status icon in Home and the sidebar. Ported from Conductor
// 0.87.6's renderApp chunk (renderApp-D_fmY7hW.js, read as data): `fJo` draws
// it, `fFi` labels it, `YXo`/`hJo`/`nJn` colour it, and `lJo`/`uJo`/`dJo` time
// its animations. This module decides what to draw; StatusMatrix.tsx draws it.
import { isGitStatus, rowStatusLabel, type RowStatus } from "./rowStatus.ts";

/** Dots of the 4×4 grid sit 2.5 in from the edge, 1.5 wide, 3 apart (`mD`, `kj`, `XXn`). */
export const MATRIX_INSET = 2.5;
export const MATRIX_DOT = 1.5;
const PITCH = MATRIX_DOT * 2;
/** The grid's side (`QXn`): seven fine cells of 1.5. */
export const MATRIX_AREA = 10.5;

export interface MatrixCell {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
}

/** The 4×4 dot grid (`NCe`). */
export const COARSE_CELLS: readonly MatrixCell[] = Array.from({ length: 16 }, (_, i) => ({
  column: i % 4,
  index: i,
  row: Math.floor(i / 4),
  x: MATRIX_INSET + (i % 4) * PITCH,
  y: MATRIX_INSET + Math.floor(i / 4) * PITCH,
}));

/** The 7×7 fine grid the working and checks-running animations use (`ket`). */
export const FINE_CELLS: readonly MatrixCell[] = Array.from({ length: 49 }, (_, i) => ({
  column: i % 7,
  index: i,
  row: Math.floor(i / 7),
  x: MATRIX_INSET + (i % 7) * MATRIX_DOT,
  y: MATRIX_INSET + Math.floor(i / 7) * MATRIX_DOT,
}));

const dotsPath = (cells: readonly MatrixCell[]) => cells.map(({ x, y }) => `M${x} ${y}h${MATRIX_DOT}v${MATRIX_DOT}h-${MATRIX_DOT}Z`).join("");

/** All sixteen dots (`JXn`). */
export const FULL_PATH = dotsPath(COARSE_CELLS);
/** The twelve border dots: an unstarted workspace (`XXo`). */
export const RING_PATH = dotsPath(COARSE_CELLS.filter(({ column, row }) => column === 0 || column === 3 || row === 0 || row === 3));
/** Merged: a checkerboard over the fine grid (`JXo`). */
export const MERGED_CELLS = FINE_CELLS.filter(({ column, row }) => (column + row) % 2 === 0);
/** Failed: the two diagonals, an X (`eJo`). */
export const ERROR_CELLS = COARSE_CELLS.filter((c) => [0, 3, 5, 6, 9, 10, 12, 15].includes(c.index));
/** A ">" chevron on the fine grid (`tJo`). */
const ARROW = Array.from({ length: 7 }, (_, i) => ({ column: 3 - Math.abs(i - 3), row: i }));
/** Column offsets of the chevrons that scroll across an automation run (`nJo`). */
const ARROW_OFFSETS = [-7, -3, 0, 4, 7, 11];
/** The moving chevrons' fine-grid cells (`gJo` over `nJo`). */
export const AUTOMATION_ARROW_CELLS = ARROW_OFFSETS.flatMap((offset) =>
  ARROW.map(({ column, row }) => ({ x: MATRIX_INSET + (column + offset) * MATRIX_DOT, y: MATRIX_INSET + row * MATRIX_DOT })),
);
/** The still ">>" an automation run shows with reduced motion or paused (`iJo`). */
export const AUTOMATION_STATIC_CELLS = [
  [0, 1], [1, 2], [2, 3], [1, 4], [0, 5], [4, 1], [5, 2], [6, 3], [5, 4], [4, 5],
].map(([column, row]) => ({ x: MATRIX_INSET + column * MATRIX_DOT, y: MATRIX_INSET + row * MATRIX_DOT }));

/** Statuses drawn with a moving overlay (`uFi`). */
const ACTIVE = new Set<RowStatus>(["cancelling", "setting-up", "waiting", "working"]);
/** Statuses that need the user, or failed (`dFi`). */
const ATTENTION = new Set<RowStatus>(["failed", "needs-plan-response", "needs-user-input", "needs-user-permission"]);

/** Dots lit when motion is reduced (`ZXn`, `rJo`, `sJo`). */
const REDUCED_COARSE = new Set([1, 3, 4, 9, 12, 14]);
const REDUCED_WORKING = new Set([2, 8, 13, 17, 24, 31, 35, 40, 46]);
const REDUCED_CHECKS = new Set([0, 8, 16, 24, 32, 40, 48]);
/** Waiting's still row and setup's corners (`eJn`, `tJn`). */
const WAITING_STATIC = new Set([4, 5, 6, 7]);
const SETUP_CORNERS = new Set([0, 3, 12, 15]);
/** Setting up animates only the ring (`oJo`); `aJo` is each dot's place around it. */
const SETUP_RING = new Set([0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4]);
const RING_ORDER = [0, 1, 2, 3, 11, 0, 0, 4, 10, 0, 0, 5, 9, 8, 7, 6];

/** A colour the indicator takes; StatusMatrix.css maps each to a theme colour. */
export type MatrixColor = "destructive" | "merged" | "in-progress" | "ready" | "highlight" | "amber" | "checks-pending" | "muted" | "foreground";

type Tone = "muted" | "negative" | "warning" | "positive" | "merged";
/** `YXo`. */
const TONE: Record<RowStatus, Tone> = {
  unstarted: "muted",
  "setting-up": "muted",
  failed: "negative",
  "needs-plan-response": "warning",
  "needs-user-permission": "warning",
  "needs-user-input": "muted",
  working: "muted",
  cancelling: "muted",
  waiting: "muted",
  merged: "merged",
  "merge-queued": "muted",
  "ready-to-merge": "positive",
  "draft-pr": "muted",
  "merge-conflict": "warning",
  "checks-failing": "negative",
  "checks-pending": "muted",
  "open-pr": "muted",
  local: "muted",
  branch: "muted",
};

/** `hJo`. */
function toneColor(t: Tone): MatrixColor | undefined {
  switch (t) {
    case "merged":
      return "merged";
    case "negative":
      return "destructive";
    case "positive":
      return "ready";
    case "warning":
      return "highlight";
    case "muted":
      return undefined;
  }
}

/** `nJn`: the git status's colour (`dWt`), but amber for a merge conflict. */
function gitColor(s: RowStatus): MatrixColor {
  switch (s) {
    case "failed":
    case "checks-failing":
      return "destructive";
    case "merged":
      return "merged";
    case "merge-queued":
      return "in-progress";
    case "ready-to-merge":
      return "ready";
    case "merge-conflict":
      return "amber";
    case "checks-pending":
      return "checks-pending";
    default:
      return "muted";
  }
}

/** A PR status worth colouring: a git status other than a plain branch or local workspace (`lWt`). */
const isColoredGitStatus = (s: RowStatus) => isGitStatus(s) && s !== "branch" && s !== "local";

export interface MatrixInput {
  status: RowStatus;
  /** The workspace's PR/branch status (`cWt`), when known. */
  gitStatus?: RowStatus;
  hasUnread?: boolean;
  /** Started by an automation: working scrolls chevrons instead of twinkling. */
  isAutomationRun?: boolean;
  /** Animations hold still on their reduced-motion frame. */
  paused?: boolean;
}

export type MatrixAnimation = "twinkle" | "sweep" | "setting-up" | "waiting" | "pulse";

export interface OverlayCell {
  x: number;
  y: number;
  size: number;
  /** Drawn in the foreground colour rather than the icon's. */
  foreground: boolean;
  animation?: MatrixAnimation;
  /** Paused: this dot is lit. */
  lit: boolean;
  reducedHighlight: boolean;
  waitingStatic: boolean;
  setupCorner: boolean;
  /** CSS custom properties that time this dot's animation. */
  style: Record<string, string>;
}

export interface MatrixModel {
  label: string;
  activity: "active" | "steady";
  /** The whole icon's colour; undefined inherits the row's. */
  color?: MatrixColor;
  /** Dimmed to half: a plain, read, steady workspace. */
  dimmed: boolean;
  base: { path: string; color?: MatrixColor; opacity: 1 | 0.5 | 0.32 };
  merged: boolean;
  error: boolean;
  /** The needs-you blink over all sixteen dots. */
  attention: boolean;
  automation: boolean;
  overlay: OverlayCell[] | null;
  paused: boolean;
}

/** `fFi`: the tooltip and accessible name, e.g. "Working; Pull request open; Unread". */
export function matrixLabel({ status, gitStatus, hasUnread = false }: MatrixInput): string {
  if (status === "unstarted") return rowStatusLabel(status);
  const active = ACTIVE.has(status);
  const attention = ATTENTION.has(status);
  const git = gitStatus ?? (isGitStatus(status) ? status : undefined);
  const colored = git !== undefined && isColoredGitStatus(git) ? git : undefined;
  const parts: string[] = [];
  if (active || attention) parts.push(rowStatusLabel(status));
  if (colored !== undefined) parts.push(rowStatusLabel(colored));
  else if (!active && !attention && !hasUnread) parts.push(rowStatusLabel(git ?? status));
  if (hasUnread) parts.push("Unread");
  return parts.join("; ");
}

const seconds = (n: number) => `${n}s`;

/** Pulse, setup and waiting timing per coarse dot (`lJo(1)`). */
const COARSE_STYLE = COARSE_CELLS.map((_, n) => {
  const phase = (((n * 47 + 13) % 97) / 97) * Math.PI * 2;
  const speed = 1.25 + ((n * 29 + 7) % 17) / 17;
  const rowPhase = (Math.PI * 2 - Math.floor(n / 4) * (Math.PI / 2)) % (Math.PI * 2);
  const ringPhase = (Math.PI * 2 + Math.PI / 2 - RING_ORDER[n] * (Math.PI / 6)) % (Math.PI * 2);
  return {
    "--workspace-matrix-pulse-delay": seconds(-phase / speed),
    "--workspace-matrix-pulse-duration": seconds((Math.PI * 2) / speed),
    "--workspace-matrix-setup-delay": seconds(-ringPhase / 4),
    "--workspace-matrix-waiting-delay": seconds(-rowPhase / 3.2),
  };
});
/** Working's twinkle per fine dot (`uJo`). */
const TWINKLE_STYLE = FINE_CELLS.map(({ index }) => {
  const at = ((index * 23 + 11) % 49) / 49;
  const duration = 1.15 + ((index * 17 + 5) % 13) / 13;
  return { "--workspace-matrix-twinkle-delay": seconds(-at * duration), "--workspace-matrix-twinkle-duration": seconds(duration) };
});
/** Checks running: a diagonal sweep per fine dot (`dJo`). */
const SWEEP_STYLE = FINE_CELLS.map(({ column, row }) => ({
  "--workspace-matrix-sweep-delay": seconds((row + column) * 0.075 - 1.5),
  "--workspace-matrix-sweep-duration": "1.5s",
}));

/** What the indicator draws for a workspace (`fJo`). */
export function statusMatrix(input: MatrixInput): MatrixModel {
  const { status, hasUnread = false, isAutomationRun = false, paused = false } = input;
  const unstarted = status === "unstarted";
  const active = ACTIVE.has(status);
  const settingUp = status === "setting-up";
  const waiting = status === "waiting";
  const working = status === "working";
  const automation = working && isAutomationRun;
  const attentionStatus = ATTENTION.has(status);
  const tone = TONE[status];
  const git = input.gitStatus ?? (isGitStatus(status) ? status : undefined);
  const colored = git !== undefined && isColoredGitStatus(git) ? git : undefined;
  const checksPending = colored === "checks-pending";
  const merged = colored === "merged";
  const error = status === "failed" || (!active && !attentionStatus && colored === "checks-failing");
  const fine = working || checksPending;
  const reduced = working ? REDUCED_WORKING : checksPending ? REDUCED_CHECKS : REDUCED_COARSE;
  const pausedLit = waiting ? WAITING_STATIC : settingUp ? SETUP_CORNERS : reduced;
  const toneColored = !active && toneColor(tone) !== undefined;
  const attention = !error && attentionStatus;
  const animated = !error && !attentionStatus && (active || checksPending);
  const overlaid = animated || attention;
  const lit = colored !== undefined || (!active && hasUnread);
  const baseColor: MatrixColor | undefined =
    git === undefined ? (overlaid ? "muted" : undefined) : colored === undefined && hasUnread && !overlaid ? "foreground" : gitColor(git);

  let overlay: OverlayCell[] | null = null;
  if (animated && !automation) {
    overlay = (fine ? FINE_CELLS : COARSE_CELLS).map((cell, i) => {
      const animation: MatrixAnimation | undefined = working
        ? "twinkle"
        : checksPending
          ? "sweep"
          : settingUp
            ? SETUP_RING.has(i)
              ? "setting-up"
              : undefined
            : waiting
              ? "waiting"
              : "pulse";
      return {
        x: cell.x,
        y: cell.y,
        size: MATRIX_DOT,
        foreground: active,
        animation: paused ? undefined : animation,
        lit: paused && pausedLit.has(i),
        reducedHighlight: reduced.has(i),
        waitingStatic: WAITING_STATIC.has(i),
        setupCorner: SETUP_CORNERS.has(i),
        style: working ? TWINKLE_STYLE[i] : checksPending ? SWEEP_STYLE[i] : COARSE_STYLE[i],
      };
    });
  }

  return {
    label: matrixLabel(input),
    activity: active ? "active" : "steady",
    color: colored !== undefined ? gitColor(colored) : toneColored ? toneColor(tone) : undefined,
    dimmed: colored === undefined && toneColored && !overlaid && !error && !hasUnread,
    base: {
      path: unstarted ? RING_PATH : FULL_PATH,
      color: error ? "destructive" : baseColor,
      opacity: error ? 0.32 : overlaid && colored !== undefined ? 0.5 : lit ? 1 : 0.32,
    },
    merged: merged && !error,
    error,
    attention,
    automation: animated && automation,
    overlay,
    paused,
  };
}
