import type { KeyboardEvent } from "react";
import type { Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { WORKSPACE_STATUSES, effectiveStatus, statusLabel, type WorkspaceStatusValue } from "../state/workspaceStatus";
import { ContextMenu, MenuItem, MenuSeparator, SubMenu } from "./menu/ContextMenu";
import {
  ArchiveIcon,
  CheckIcon,
  CircleDashedIcon,
  FolderInputIcon,
  FolderMinusIcon,
  LinkIcon,
  MailIcon,
  MailOpenIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  WorkspaceStatusGlyph,
} from "./menu/menuIcons";
import { isWorkspaceUnread } from "../state/chatUnread";

// Conductor's workspace row menu: the sidebar row (`Qj` @9894200) wraps itself in a Base UI
// ContextMenu whose popup is `${my} min-w-[200px]` around `D9e` -> `Aao` @7302657
// (renderApp-D_fmY7hW.js, REA-extracted, read as data). Local-workspace items, in order:
//   Mark as read (mail-open) / Mark as unread (mail), shortcut R
//   Pin (pin) / Unpin (pin-off), shortcut P
//   Set status ▸ (circle-dashed; submenu `w-44`: status glyph, label flex-1, check on current)
//   Move to section ▸ (folder-input; `Xoo`/`Joo`, submenu `min-w-44`: sections with emoji,
//     the current one checked and disabled, a separator when there are sections,
//     New section… (plus), Remove from section (folder-minus) when it is in one)
//   Rename (pencil)
//   Copy link (link), ⌘⇧C only on the open workspace's row (`de = NCi(n)`)
//   separator
//   Archive (archive), ⌘⇧A only on the open workspace's row (Unarchive, rotate-ccw, on an
//     archived one, which the sidebar does not list)
// Cloud-only items (Start, Follow, Reassign, Copy SSH command) and the internal build's
// "Copy workspace info" rows do not apply to a local OpenConductor workspace.
// R and P act on the row while the menu is open (`Fao`: workspace.contextMenu.toggleRead /
// togglePin). Copy link (`XV`) copies openconductor://workspace?id=<id> (src/workspace/link.ts).

export interface WorkspaceActions {
  toggleRead: () => void;
  togglePin: () => void;
  setStatus: (status: WorkspaceStatusValue) => void;
  /** Absent until the rename dialog exists; the item is hidden. */
  rename?: () => void;
  /** Absent when nobody handles it; the item is hidden. */
  copyLink?: () => void;
  archive: () => void;
  moveToSection: (sectionId: string) => void;
  /** Opens the New section dialog with this workspace to move. */
  newSection: () => void;
  removeFromSection: () => void;
}

interface Props {
  workspace: Workspace;
  /** Row is the selected workspace: Conductor shows the ⌘⇧C and ⌘⇧A hints only then. */
  selected: boolean;
  /** Viewport point the menu opens at (the right-click position). */
  at: { x: number; y: number };
  actions: WorkspaceActions;
  /** The user's sections, in sidebar order. */
  sections: readonly NavSection[];
  /** Section that holds this workspace, if any. */
  currentSectionId?: string;
  onClose: () => void;
}

export function WorkspaceActionsMenu({ workspace, selected, at, actions, sections, currentSectionId, onClose }: Props) {
  const current = effectiveStatus(workspace);
  const pinned = typeof workspace.pinnedAt === "number";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key !== "r" && key !== "p") return;
    e.preventDefault();
    (key === "r" ? actions.toggleRead : actions.togglePin)();
    onClose();
  };

  return (
    <ContextMenu at={at} onClose={onClose} label="Workspace actions" className="cm-min-w-200" onKeyDown={onKeyDown}>
      <MenuItem icon={isWorkspaceUnread(workspace) ? <MailOpenIcon /> : <MailIcon />} shortcut="R" onSelect={actions.toggleRead}>
        {isWorkspaceUnread(workspace) ? "Mark as read" : "Mark as unread"}
      </MenuItem>
      <MenuItem icon={pinned ? <PinOffIcon /> : <PinIcon />} shortcut="P" onSelect={actions.togglePin}>
        {pinned ? "Unpin" : "Pin"}
      </MenuItem>
      <SubMenu icon={<CircleDashedIcon />} label="Set status" className="cm-w-44">
        {WORKSPACE_STATUSES.map((s) => (
          <MenuItem
            key={s}
            icon={<span className="cm-status-wrap"><WorkspaceStatusGlyph status={s} /></span>}
            grow
            checked={s === current}
            trailing={s === current ? <CheckIcon /> : undefined}
            onSelect={() => actions.setStatus(s)}
          >
            {statusLabel(s)}
          </MenuItem>
        ))}
      </SubMenu>
      <SubMenu icon={<FolderInputIcon />} label="Move to section" className="cm-min-w-44">
        {sections.map((section) => {
          const here = section.id === currentSectionId;
          return (
            <MenuItem
              key={section.id}
              icon={section.emoji !== undefined ? <span aria-hidden className="cm-emoji">{section.emoji}</span> : undefined}
              grow
              checked={here}
              disabled={here}
              trailing={here ? <CheckIcon /> : undefined}
              onSelect={() => actions.moveToSection(section.id)}
            >
              {section.name}
            </MenuItem>
          );
        })}
        {sections.length > 0 && <MenuSeparator />}
        <MenuItem icon={<PlusIcon />} onSelect={actions.newSection}>New section…</MenuItem>
        {currentSectionId !== undefined && (
          <MenuItem icon={<FolderMinusIcon />} onSelect={actions.removeFromSection}>Remove from section</MenuItem>
        )}
      </SubMenu>
      {actions.rename && <MenuItem icon={<PencilIcon />} onSelect={actions.rename}>Rename</MenuItem>}
      {actions.copyLink && (
        <MenuItem icon={<LinkIcon />} shortcut={selected ? "⌘⇧C" : undefined} onSelect={actions.copyLink}>
          Copy link
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={<ArchiveIcon />} shortcut={selected ? "⌘⇧A" : undefined} onSelect={actions.archive}>
        Archive
      </MenuItem>
    </ContextMenu>
  );
}
