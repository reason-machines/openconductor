// parity:chat.tabs:ui
// A chat tab's right-click menu: Conductor's `u8i` (renderApp-D_fmY7hW.js,
// read with REA as data). In order, all without icons:
//   Mark as read / Mark as unread
//   Rename chat                 - when the chat can be renamed
//   Fork to new tab  ⌘⌥↵        - with Experimental › Fork chat to new tab on
//   ──
//   Copy concise transcript ⌘⌥C
//   Copy full transcript
//   Copy link
//   (── Copy session info: internal builds only, not offered here)
//   ──
//   Close tab  ⌘W               - when the tab can be closed; Conductor shows it on
//                                 a chat with messages or when there are others
//   Close others                - disabled when the workspace has one chat
// Minimum width 200px (`min-w-[200px]`).
import type { ReactNode } from "react";
import { ContextMenu, EnterGlyph, MenuItem, MenuSeparator, type Point } from "../../components/ContextMenu";
import type { TranscriptMode } from "./transcriptCopy.ts";

export interface ChatTabMenuActions {
  /** Read state of the chat; absent while chats have no read state (the item is disabled). */
  unread?: boolean;
  toggleRead?: () => void;
  /** Absent while chats cannot be renamed (the item is disabled). */
  rename?: () => void;
  /** Absent when forking to a new tab is off. */
  fork?: () => void;
  copyTranscript: (mode: TranscriptMode) => void;
  copyLink: () => void;
  /** Conductor's `showClose`: the Close section is shown. */
  showClose: boolean;
  /** Absent while this tab cannot be closed (shown disabled). */
  close?: () => void;
  closeOthers: () => void;
  hasOtherChats: boolean;
}

interface Props {
  at: Point;
  title: string;
  actions: ChatTabMenuActions;
  /** Rendered shortcut hints, from the user's key bindings. */
  keys: { fork?: ReactNode; copyConcise?: ReactNode; close?: ReactNode };
  onClose: () => void;
}

export function ChatTabMenu({ at, title, actions: a, keys, onClose }: Props) {
  return (
    <ContextMenu at={at} label={`Chat ${title}`} onClose={onClose} minWidth={200}>
      <MenuItem disabled={!a.toggleRead} onSelect={a.toggleRead}>
        {a.unread ? "Mark as read" : "Mark as unread"}
      </MenuItem>
      <MenuItem disabled={!a.rename} onSelect={a.rename}>
        Rename chat
      </MenuItem>
      {a.fork && (
        <MenuItem onSelect={a.fork} shortcut={keys.fork}>
          Fork to new tab
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem onSelect={() => a.copyTranscript("concise")} shortcut={keys.copyConcise}>
        Copy concise transcript
      </MenuItem>
      <MenuItem onSelect={() => a.copyTranscript("complete")}>Copy full transcript</MenuItem>
      <MenuItem onSelect={a.copyLink}>Copy link</MenuItem>
      {a.showClose && (
        <>
          <MenuSeparator />
          <MenuItem disabled={!a.close} onSelect={a.close} shortcut={keys.close}>
            Close tab
          </MenuItem>
          <MenuItem disabled={!a.hasOtherChats} onSelect={a.closeOthers}>
            Close others
          </MenuItem>
        </>
      )}
    </ContextMenu>
  );
}

/** "⌘⌥" followed by Conductor's ↵ glyph, for the Fork to new tab hint. */
export function forkShortcut(text: string | undefined): ReactNode {
  if (!text) return undefined;
  if (!text.endsWith("↵")) return text;
  return (
    <>
      {text.slice(0, -1)}
      <EnterGlyph />
    </>
  );
}
