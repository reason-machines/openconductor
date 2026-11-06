// A chat tab's right-click menu. Conductor's (renderApp-D_fmY7hW.js `u8i` @7,417,968, read
// with REA on sven m5 max as data) is a Base UI ContextMenu (`kS` > `gy` "min-w-[200px]")
// over the tab with, in order:
//   Mark as read / Mark as unread
//   Rename chat                      (canRename: not archived)
//   Fork to new tab        ⌘⌥↵       (Experimental "Fork chat to new tab", not archived)
//   ───
//   Copy concise transcript  ⌘⌥C
//   Copy full transcript
//   Copy link
//   (Copy session info: Conductor's staff-only item, left out)
//   ───
//   Close tab                ⌘W
//   Close others                     (disabled while it is the only chat)
// No item has an icon. Conductor shows the close items on every chat tab of a workspace the
// user can write to, its first chat too (`showClose: v === "write"`). OpenConductor's own
// chat cannot close, so there Close tab is disabled; Close others still closes the rest.
import { ContextMenu, MenuItem, MenuSeparator } from "./menu/ContextMenu";
import { CornerDownLeftIcon } from "./menu/menuIcons";

export interface ChatTabMenuActions {
  toggleRead: () => void;
  /** Absent for an archived workspace. */
  rename?: () => void;
  /** Absent unless "Fork chat to new tab" is on and the workspace is not archived. */
  fork?: () => void;
  copyConcise: () => void;
  copyComplete: () => void;
  copyLink: () => void;
  /** Absent (disabled) for a tab that cannot close: the workspace's own chat. */
  close?: () => void;
  /** Closes every other chat tab; absent (disabled) while it is the only chat. */
  closeOthers?: () => void;
}

interface Props {
  at: { x: number; y: number };
  unread: boolean;
  actions: ChatTabMenuActions;
  onClose: () => void;
}

export function ChatTabMenu({ at, unread, actions, onClose }: Props) {
  return (
    <ContextMenu at={at} onClose={onClose} label="Chat actions" className="cm-min-w-200">
      <MenuItem onSelect={actions.toggleRead}>{unread ? "Mark as read" : "Mark as unread"}</MenuItem>
      {actions.rename && <MenuItem onSelect={actions.rename}>Rename chat</MenuItem>}
      {actions.fork && (
        <MenuItem
          onSelect={actions.fork}
          trailing={
            <span className="cm-shortcut cm-shortcut-glyph">
              ⌘⌥
              <CornerDownLeftIcon />
            </span>
          }
        >
          Fork to new tab
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem onSelect={actions.copyConcise} shortcut="⌘⌥C">
        Copy concise transcript
      </MenuItem>
      <MenuItem onSelect={actions.copyComplete}>Copy full transcript</MenuItem>
      <MenuItem onSelect={actions.copyLink}>Copy link</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => actions.close?.()} disabled={!actions.close} shortcut="⌘W">
        Close tab
      </MenuItem>
      <MenuItem onSelect={() => actions.closeOthers?.()} disabled={!actions.closeOthers}>
        Close others
      </MenuItem>
    </ContextMenu>
  );
}
