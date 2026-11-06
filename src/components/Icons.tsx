// The shared icon set. Every icon draws Conductor's Lucide geometry through
// ConductorIcon (see tools/icons/gen_shared_icons.mjs); brand marks stay drawn here.
import type { CSSProperties } from "react";
import { ConductorIcon } from "./ConductorIcon";

type P = { size?: number; strokeWidth?: number };

export const FolderIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="folder" size={size} strokeWidth={strokeWidth} />;
export const CloudIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="cloud" size={size} strokeWidth={strokeWidth} />;
export const SparkIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="sparkle" size={size} strokeWidth={strokeWidth} />;
/** Conductor's Dashboard row icon (Lucide "layout-grid"). */
export const LayoutGridIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="layout-grid" size={size} strokeWidth={strokeWidth} />;
export const HomeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="house" size={size} strokeWidth={strokeWidth} />;
export const SidebarIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="panel-left" size={size} strokeWidth={strokeWidth} />;
/** Right-hand panel toggle: Conductor's sidebar glyph with the divider on the right (hand-drawn, not in the Lucide set). */
export const RightSidebarIcon = ({ size = 16, strokeWidth }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth ?? 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M15 4v16" />
  </svg>
);
export const PlusIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="plus" size={size} strokeWidth={strokeWidth} />;
export const ChevronIcon = ({ size, open, strokeWidth }: P & { open?: boolean }) => {
  const style: CSSProperties = { transform: open ? "rotate(90deg)" : undefined, transition: "transform .12s" };
  return <ConductorIcon name="chevron-right" size={size} strokeWidth={strokeWidth} style={style} />;
};
export const BranchIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="git-branch" size={size} strokeWidth={strokeWidth} />;
export const PaperclipIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="paperclip" size={size} strokeWidth={strokeWidth} />;
export const SendIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="send-horizontal" size={size} strokeWidth={strokeWidth} />;
export const FileIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="file" size={size} strokeWidth={strokeWidth} />;
/** Help › Diagnostics (Lucide "stethoscope", Conductor's `rhi`). */
export const StethoscopeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="stethoscope" size={size} strokeWidth={strokeWidth} />;
/** Conductor's external-link marker in the Help menu (Lucide "arrow-up-right", its `co`). */
export const ArrowUpRightIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="arrow-up-right" size={size} strokeWidth={strokeWidth} />;
export const KeyboardIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="keyboard" size={size} strokeWidth={strokeWidth} />;
export const SearchIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="search" size={size} strokeWidth={strokeWidth} />;
export const CloseIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="x" size={size} strokeWidth={strokeWidth} />;
export const LockIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="lock" size={size} strokeWidth={strokeWidth} />;
export const ArchiveIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="archive" size={size} strokeWidth={strokeWidth} />;
export const ArrowLeftIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="arrow-left" size={size} strokeWidth={strokeWidth} />;
export const ArrowDownIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="arrow-down" size={size} strokeWidth={strokeWidth} />;
export const ArrowRightIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="arrow-right" size={size} strokeWidth={strokeWidth} />;
export const MoreIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="ellipsis" size={size} strokeWidth={strokeWidth} />;
export const CodeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="code-xml" size={size} strokeWidth={strokeWidth} />;
export const ChevronDownIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="chevron-down" size={size} strokeWidth={strokeWidth} />;
export const ChevronsUpDownIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="chevrons-up-down" size={size} strokeWidth={strokeWidth} />;
export const HelpIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="circle-question-mark" size={size} strokeWidth={strokeWidth} />;
export const SettingsIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="settings" size={size} strokeWidth={strokeWidth} />;
export const BookIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="book-open" size={size} strokeWidth={strokeWidth} />;
export const MessageIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="message-square" size={size} strokeWidth={strokeWidth} />;
export const CircleAlertIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="circle-alert" size={size} strokeWidth={strokeWidth} />;
export const RefreshCwIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="refresh-cw" size={size} strokeWidth={strokeWidth} />;
export const ExternalIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="external-link" size={size} strokeWidth={strokeWidth} />;
export const FileCodeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="file-code" size={size} strokeWidth={strokeWidth} />;
export const GlobeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="globe" size={size} strokeWidth={strokeWidth} />;
export const FolderPlusIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="folder-plus" size={size} strokeWidth={strokeWidth} />;
// Home's "cities visited" line: Conductor draws Lucide's tickets-plane there.
export const TicketsPlaneIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="tickets-plane" size={size} strokeWidth={strokeWidth} />;
export const ChipIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="cpu" size={size} strokeWidth={strokeWidth} />;
export const TerminalIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="terminal" size={size} strokeWidth={strokeWidth} />;
export const LayersIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="layers" size={size} strokeWidth={strokeWidth} />;
export const ListTreeIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="list-tree" size={size} strokeWidth={strokeWidth} />;
export const CopyIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="copy" size={size} strokeWidth={strokeWidth} />;
export const CheckIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="check" size={size} strokeWidth={strokeWidth} />;
export const ChevronUpIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="chevron-up" size={size} strokeWidth={strokeWidth} />;
export const UserIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="user" size={size} strokeWidth={strokeWidth} />;
// Routines (Conductor's /routines): the sidebar row and Run button draw Lucide's play,
// the suggestions calendar-check / heart-pulse / newspaper with clock-3 by the schedule.
export const PlayIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="play" size={size} strokeWidth={strokeWidth} />;
export const CalendarCheckIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="calendar-check" size={size} strokeWidth={strokeWidth} />;
export const HeartPulseIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="heart-pulse" size={size} strokeWidth={strokeWidth} />;
export const NewspaperIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="newspaper" size={size} strokeWidth={strokeWidth} />;
export const ClockIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="clock-3" size={size} strokeWidth={strokeWidth} />;
export const TrashIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="trash-2" size={size} strokeWidth={strokeWidth} />;
export const PowerIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="power" size={size} strokeWidth={strokeWidth} />;
export const LinkIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="link" size={size} strokeWidth={strokeWidth} />;
export const WebhookIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="webhook" size={size} strokeWidth={strokeWidth} />;
export const PullRequestIcon = ({ size, strokeWidth }: P) => <ConductorIcon name="git-pull-request" size={size} strokeWidth={strokeWidth} />;

export const LogoMark = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="1" y="1" width="22" height="22" rx="6" style={{ fill: "var(--logo-bg)" }} />
    <path d="M12 5.5c.35 3.9 1.9 5.6 6.5 6.5-4.6.9-6.15 2.6-6.5 6.5-.35-3.9-1.9-5.6-6.5-6.5 4.6-.9 6.15-2.6 6.5-6.5z" style={{ fill: "var(--logo-fg)" }} />
    <circle cx="16.6" cy="7.6" r="1" style={{ fill: "var(--logo-dot)" }} />
  </svg>
);

/** A plain circled "N" standing in for the Next.js template mark. */
export const NextMarkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M9 16.5v-9l7.5 10M15 7.5v5.5" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
