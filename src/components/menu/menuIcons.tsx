// Icons Conductor puts in its sidebar right-click menus. Conductor draws them with
// lucide-react (renderApp-D_fmY7hW.js, `Ln("<name>", …)` icon modules) at the menu
// item's 16px (`[&_svg]:size-4`). Shapes are Lucide's (ISC License, Copyright (c)
// Lucide Icons and Contributors), the same set tools/sidebar/gen_repo_icons.mjs uses.
import type { ReactNode } from "react";

type El = ["path", string] | ["circle", number, number, number] | ["rect", number, number, number, number, number] | ["line", number, number, number, number];

/**
 * `isLucide`: lucide-react adds the `lucide` class, and Conductor's stylesheet draws every
 * `.lucide` icon with a 1px non-scaling stroke (`.lucide{stroke-width:1px}`,
 * `.lucide *{vector-effect:non-scaling-stroke}`, renderApp-BYEcFwvt.css). Its react-icons
 * glyphs (circle-dashed, `DCi`) keep their 2 / 1.5 stroke.
 */
function lucide(els: El[], isLucide = true) {
  return function LucideIcon({ strokeWidth = 2, className }: { strokeWidth?: number; className?: string } = {}): JSX.Element {
    const cls = [isLucide ? "lucide" : "", className ?? ""].filter(Boolean).join(" ") || undefined;
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={cls} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {els.map((e, i): ReactNode => {
          switch (e[0]) {
            case "path":
              return <path key={i} d={e[1]} />;
            case "circle":
              return <circle key={i} cx={e[1]} cy={e[2]} r={e[3]} />;
            case "rect":
              return <rect key={i} x={e[1]} y={e[2]} width={e[3]} height={e[4]} rx={e[5]} />;
            case "line":
              return <line key={i} x1={e[1]} y1={e[2]} x2={e[3]} y2={e[4]} />;
          }
        })}
      </svg>
    );
  };
}

/** `mail-open` (`l1i`): Mark as read. */
export const MailOpenIcon = lucide([
  ["path", "M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z"],
  ["path", "m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10"],
]);
/** `mail` (`u1i`): Mark as unread. */
export const MailIcon = lucide([
  ["path", "m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"],
  ["rect", 2, 4, 20, 16, 2],
]);
/** `pin` (`rfi`). */
export const PinIcon = lucide([
  ["path", "M12 17v5"],
  ["path", "M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"],
]);
/** `pin-off` (`nfi`). */
export const PinOffIcon = lucide([
  ["path", "M12 17v5"],
  ["path", "M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"],
  ["path", "m2 2 20 20"],
  ["path", "M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"],
]);
/** `circle-dashed` (`DCi`, react-icons' lucide set): Set status. */
export const CircleDashedIcon = lucide([
  ["path", "M10.1 2.182a10 10 0 0 1 3.8 0"],
  ["path", "M13.9 21.818a10 10 0 0 1-3.8 0"],
  ["path", "M17.609 3.721a10 10 0 0 1 2.69 2.7"],
  ["path", "M2.182 13.9a10 10 0 0 1 0-3.8"],
  ["path", "M20.279 17.609a10 10 0 0 1-2.7 2.69"],
  ["path", "M21.818 10.1a10 10 0 0 1 0 3.8"],
  ["path", "M3.721 6.391a10 10 0 0 1 2.7-2.69"],
  ["path", "M6.391 20.279a10 10 0 0 1-2.69-2.7"],
], false);
/** `folder-input` (`WLt`): Move to section. */
export const FolderInputIcon = lucide([
  ["path", "M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"],
  ["path", "M2 13h10"],
  ["path", "m9 16 3-3-3-3"],
]);
/** `folder-minus` (`GLt`): Remove from section. */
export const FolderMinusIcon = lucide([
  ["path", "M9 13h6"],
  ["path", "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
]);
/** `pencil` (`Cm`): Rename, Edit section. */
export const PencilIcon = lucide([
  ["path", "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"],
  ["path", "m15 5 4 4"],
]);
/** `link` (`$H`): Copy link. */
export const LinkIcon = lucide([
  ["path", "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"],
  ["path", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
]);
/** `link-2` (`Zdi`): Create from... */
export const Link2Icon = lucide([
  ["path", "M9 17H7A5 5 0 0 1 7 7h2"],
  ["path", "M15 7h2a5 5 0 1 1 0 10h-2"],
  ["line", 8, 12, 16, 12],
]);
/** `archive` (`O9`). */
export const ArchiveIcon = lucide([
  ["rect", 2, 3, 20, 5, 1],
  ["path", "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"],
  ["path", "M10 12h4"],
]);
/** `rotate-ccw` (`nI`): Unarchive. */
export const RotateCcwIcon = lucide([
  ["path", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"],
  ["path", "M3 3v5h5"],
]);
/** `check` (`Uo`). */
export const CheckIcon = lucide([["path", "M20 6 9 17l-5-5"]]);
/** `ellipsis` (`iD`): the chat turn footer's "Show message actions" trigger. */
export const EllipsisIcon = lucide([
  ["circle", 12, 12, 1],
  ["circle", 19, 12, 1],
  ["circle", 5, 12, 1],
]);
/** `message-square-plus` (`uEe`): Fork to new tab. */
export const MessageSquarePlusIcon = lucide([
  ["path", "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"],
  ["path", "M12 8v6"],
  ["path", "M9 11h6"],
]);
/** `split` (`Bfi`): Fork to new workspace. */
export const SplitIcon = lucide([
  ["path", "M16 3h5v5"],
  ["path", "M8 3H3v5"],
  ["path", "M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"],
  ["path", "m15 9 6-6"],
]);
/** `undo-2` (`YQe`): Reset chat. */
export const Undo2Icon = lucide([
  ["path", "M9 14 4 9l5-5"],
  ["path", "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"],
]);
/** `chevron-right` (`td`): submenu triggers. */
export const ChevronRightIcon = lucide([["path", "m9 18 6-6-6-6"]]);
/** `plus` (`Qc`). */
export const PlusIcon = lucide([
  ["path", "M5 12h14"],
  ["path", "M12 5v14"],
]);
/** `settings` (`cv`): Configuration. */
export const SettingsIcon = lucide([
  ["path", "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"],
  ["circle", 12, 12, 3],
]);
/** `eye` (`ob`): Unhide repository. */
export const EyeIcon = lucide([
  ["path", "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"],
  ["circle", 12, 12, 3],
]);
/** `eye-off` (`d5`): Hide repository. */
export const EyeOffIcon = lucide([
  ["path", "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"],
  ["path", "M14.084 14.158a3 3 0 0 1-4.242-4.242"],
  ["path", "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"],
  ["path", "m2 2 20 20"],
]);
/** `trash-2` (`c_`): Remove repository, Delete section. */
export const Trash2Icon = lucide([
  ["path", "M10 11v6"],
  ["path", "M14 11v6"],
  ["path", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"],
  ["path", "M3 6h18"],
  ["path", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
]);

/**
 * Set status submenu icons (Conductor's `K5e`): 12px status glyphs in the status colour,
 * stroke 1.5, which the item's `[&_svg]:size-4` draws at 16px. Backlog is the dashed
 * circle, In progress and In review are half and three-quarter pies (`Moo`, `joo`);
 * Done and Canceled are filled circles with a check or cross (Conductor uses
 * react-icons' Font Awesome glyphs there; these are drawn for OpenConductor).
 */
export function WorkspaceStatusGlyph({ status }: { status: "backlog" | "in-progress" | "in-review" | "done" | "canceled" }) {
  const cls = `cm-status cm-status-${status}`;
  switch (status) {
    case "backlog":
      return <CircleDashedIcon strokeWidth={1.5} className={cls} />;
    case "in-progress":
    case "in-review":
      return (
        <svg viewBox="0 0 16 16" fill="currentColor" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d={status === "in-progress" ? "M 8 3 A 5 5 0 0 1 8 13 L 8 8 Z" : "M 8 3 A 5 5 0 1 1 3 8 L 8 8 Z"} fill="currentColor" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="7.75" fill="currentColor" />
          <path d="m4.6 8.3 2.3 2.3 4.6-4.9" fill="none" stroke="var(--cm-popover)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "canceled":
      return (
        <svg viewBox="0 0 16 16" className={cls} aria-hidden>
          <circle cx="8" cy="8" r="7.75" fill="currentColor" />
          <path d="m5.4 5.4 5.2 5.2m0-5.2-5.2 5.2" fill="none" stroke="var(--cm-popover)" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
  }
}

/** `copy` (`Zh`): Copy path, Copy relative path, Copy link. */
export const CopyIcon = lucide([
  ["rect", 8, 8, 14, 14, 2],
  ["path", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
]);
/** `arrow-up-right` (`co`): Open in (a file's apps, the PR's sites). */
export const ArrowUpRightIcon = lucide([
  ["path", "M7 7h10v10"],
  ["path", "M7 17 17 7"],
]);
/** `hash` (`YLt`): the PR menu's Copy number. */
export const HashIcon = lucide([
  ["line", 4, 9, 20, 9],
  ["line", 4, 15, 20, 15],
  ["line", 10, 3, 8, 21],
  ["line", 16, 3, 14, 21],
]);
/** `message-square-text` (`eMt`): the Rename chat dialog's title. */
export const MessageSquareTextIcon = lucide([
  ["path", "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"],
  ["path", "M7 11h10"],
  ["path", "M7 15h6"],
  ["path", "M7 7h8"],
]);
/** `corner-down-left` (`BLt`, drawn by `gf` at 12px as "Enter"): the ⌘⌥↵ shortcut hint. */
export const CornerDownLeftIcon = lucide([
  ["path", "M20 4v7a4 4 0 0 1-4 4H4"],
  ["path", "m9 10-5 5 5 5"],
]);
