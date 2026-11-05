// Icons the composer uses. Conductor draws them with Lucide (ISC license) at
// 24×24 and sizes them with classes (size-3, size-3.5, size-4); the path data
// here is Lucide's for the same icon names. The stop icon is Ionicons'
// stop-circle-outline (MIT), which Conductor's Cancel button uses.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

function Lucide({ size = 16, strokeWidth = 2, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

export const ArrowUpIcon = (p: IconProps) => (
  <Lucide {...p}>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </Lucide>
);
export const CornerDownLeftIcon = (p: IconProps) => (
  <Lucide {...p}>
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    <path d="m9 10-5 5 5 5" />
  </Lucide>
);
export const CheckIcon = (p: IconProps) => (
  <Lucide size={14} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Lucide>
);
export const PlusIcon = (p: IconProps) => (
  <Lucide {...p}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </Lucide>
);
export const PlusSmallIcon = (p: IconProps) => <PlusIcon size={14} {...p} />;
export const ChevronDownIcon = (p: IconProps) => (
  <Lucide size={12} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Lucide>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Lucide size={14} {...p}>
    <path d="m9 18 6-6-6-6" />
  </Lucide>
);
export const SearchSmallIcon = (p: IconProps) => (
  <Lucide size={14} className="oc-model-search-icon" {...p}>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </Lucide>
);
export const ArrowUpRightIcon = (p: IconProps) => (
  <Lucide size={14} {...p}>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </Lucide>
);
export const SettingsSmallIcon = (p: IconProps) => (
  <Lucide size={12} {...p}>
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </Lucide>
);
export const PaperclipIcon = (p: IconProps) => (
  <Lucide {...p}>
    <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
  </Lucide>
);
export const FolderSymlinkIcon = (p: IconProps) => (
  <Lucide {...p}>
    <path d="M2 9.35V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h7" />
    <path d="m8 16 3-3-3-3" />
  </Lucide>
);

/** Ionicons stop-circle-outline, Conductor's Cancel button icon. */
export const StopCircleIcon = ({ size = 16, ...rest }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 512 512" fill="currentColor" stroke="currentColor" strokeWidth={0} aria-hidden {...rest}>
    <path fill="none" strokeMiterlimit={10} strokeWidth={32} d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" />
    <path d="M310.4 336H201.6a25.62 25.62 0 0 1-25.6-25.6V201.6a25.62 25.62 0 0 1 25.6-25.6h108.8a25.62 25.62 0 0 1 25.6 25.6v108.8a25.62 25.62 0 0 1-25.6 25.6z" />
  </svg>
);

/**
 * The small mark before a model in the picker. Conductor shows the agent's
 * logo there; OpenConductor ships no third-party logos, so it draws a neutral
 * mark in the agent's colour instead (see the PR's remaining differences).
 */
export function ModelGlyph({ model }: { model: string }) {
  const agent = model.startsWith("gpt-") ? "codex" : /^(opus|sonnet|haiku|fable)/.test(model) ? "claude" : "other";
  return (
    <svg className="oc-model-glyph" data-agent={agent} width={14} height={14} viewBox="0 0 16 16" aria-hidden>
      <path fill="currentColor" d="M8 1.5c.4 3.3 1.6 4.6 5 5-3.4.4-4.6 1.7-5 5-.4-3.3-1.6-4.6-5-5 3.4-.4 4.6-1.7 5-5z" />
    </svg>
  );
}
