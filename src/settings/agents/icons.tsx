// Icons for Settings › Agents and Default models. Simple strokes drawn for
// OpenConductor in the shape and size Conductor uses (lucide-style 24 px grid),
// not Conductor's brand assets.
import type { ReactNode } from "react";
export { ReasonMark } from "../../components/ReasonMark";

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
/**
 * Codex and the ChatGPT card: the OpenAI blossom, filled with currentColor. The path is
 * Conductor's (renderApp-D_fmY7hW.js, offset 2136261, `fill: "currentColor"`, viewBox 0 0 24 24).
 */
export const CodexMark = ({ size = 14 }: { size?: number }) =>
  svg(
    size,
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />,
    true,
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

export type AgentTabId = "claude" | "codex";

/** The tab icon of each agent (Conductor's `axe`). */
export function AgentMark({ agent, size = 14 }: { agent: AgentTabId; size?: number }) {
  switch (agent) {
    case "claude":
      return <ClaudeMark size={size} />;
    case "codex":
      return <CodexMark size={size} />;
  }
}
