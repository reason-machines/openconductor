// Icons for Settings › Agents and Default models. Simple strokes drawn for
// OpenConductor in the shape and size Conductor uses (lucide-style 24 px grid),
// not Conductor's brand assets.
import type { ReactNode } from "react";

const svg = (size: number, children: ReactNode, fill = false) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? "currentColor" : "none"}
    stroke={fill ? "none" : "currentColor"}
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

/** Claude Code: an eight-ray spark. */
export const ClaudeMark = ({ size = 14 }: { size?: number }) =>
  svg(size, <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />);
/** Codex: a rounded knot. */
export const CodexMark = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v9M8.1 9.75l7.8 4.5M8.1 14.25l7.8-4.5" />
    </>,
  );
/** Cursor: an isometric cube. */
export const CursorMark = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
    </>,
  );
/** OpenCode: a framed block. */
export const OpenCodeMark = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <rect x="8" y="7" width="8" height="10" />
    </>,
  );

export const TerminalIcon = ({ size = 24 }: { size?: number }) => svg(size, <path d="m5 7 5 5-5 5M12 19h7" />);
export const KeyIcon = ({ size = 24 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="15.5" cy="8.5" r="4.5" />
      <path d="m12.3 11.7-8.3 8.3M7 17l2 2M9.5 14.5l2 2" />
    </>,
  );
export const CheckIcon = ({ size = 16 }: { size?: number }) => svg(size, <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const RefreshIcon = ({ size = 12, spinning }: { size?: number; spinning?: boolean }) => (
  <span className={spinning ? "ag-spin" : undefined} style={{ display: "inline-flex" }}>
    {svg(size, <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M20 20v-4.5h-4.5" />)}
  </span>
);
export const PlayIcon = ({ size = 12 }: { size?: number }) => svg(size, <path d="M7 4.5v15l12-7.5z" />, true);
export const ExternalIcon = ({ size = 12 }: { size?: number }) => svg(size, <path d="M7 17 17 7M8 7h9v9" />);
export const EyeIcon = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>,
  );
export const PencilIcon = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />);
export const TrashIcon = ({ size = 16 }: { size?: number }) => svg(size, <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />);
export const CloseIcon = ({ size = 14 }: { size?: number }) => svg(size, <path d="M6 6l12 12M18 6 6 18" />);
export const ChevronDownIcon = ({ size = 14 }: { size?: number }) => svg(size, <path d="m6 9 6 6 6-6" />);
export const ChevronRightIcon = ({ size = 16 }: { size?: number }) => svg(size, <path d="m9 6 6 6-6 6" />);
export const GripIcon = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <>
      {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="currentColor" stroke="none" />))}
    </>,
  );

export const GearIcon = ({ size = 16 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>,
  );

/** Reason: a ringed dot. */
export const ReasonMark = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
    </>,
  );

export type AgentTabId = "claude" | "codex" | "cursor" | "opencode";

/** The tab icon of each agent (Conductor's `axe`). */
export function AgentMark({ agent, size = 14 }: { agent: AgentTabId; size?: number }) {
  switch (agent) {
    case "claude":
      return <ClaudeMark size={size} />;
    case "codex":
      return <CodexMark size={size} />;
    case "cursor":
      return <CursorMark size={size} />;
    case "opencode":
      return <OpenCodeMark size={size} />;
  }
}
