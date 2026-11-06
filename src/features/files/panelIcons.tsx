// Right-panel icons (All files tree, its toolbar, the Setup / Run / Terminal
// strip). Lucide shapes (ISC), drawn like Conductor's Lucide icons: 24x24,
// stroke 2. Kept here until the shared icon set lands on main; then these
// become imports from it.
import type { ReactNode } from "react";

type P = { size?: number; className?: string };

const icon = (paths: ReactNode) =>
  function Icon({ size = 14, className }: P) {
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths}
      </svg>
    );
  };

export const FolderClosedIcon = icon(<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />);
export const FolderOpenIcon = icon(
  <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />,
);
export const ChevronRightIcon = icon(<path d="m9 18 6-6-6-6" />);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const FilePlusIcon = icon(
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M9 15h6" />
    <path d="M12 18v-6" />
  </>,
);
/** Collapse all folders (Lucide "chevrons-down-up"). */
export const CollapseAllIcon = icon(
  <>
    <path d="m7 20 5-5 5 5" />
    <path d="m7 4 5 5 5-5" />
  </>,
);
export const PlusIcon = icon(
  <>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </>,
);
export const XIcon = icon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
);
export const EraserIcon = icon(
  <>
    <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21" />
    <path d="m5.082 11.09 8.828 8.828" />
  </>,
);
