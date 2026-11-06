// parity:chat.tabs:ui
// A chat tab's right-click menu: Conductor 0.87.6's `u8i` (renderApp-D_fmY7hW.js
// @7,417,968, REA-extracted, read as data). Popup `min-w-[200px]`, no icons, in order:
//   Mark as read / Mark as unread
//   Rename chat                 - when the chat can be renamed (`canRename`)
//   Fork to new tab  ⌘⌥↵        - with Experimental › Fork chat to new tab on, in a
//                                 workspace that is not archived; disabled while forking
//   ──
//   Copy concise transcript ⌘⌥C
//   Copy full transcript
//   Copy link
//   (── Copy session info: Conductor's internal builds only, not offered here)
//   ── (`showClose` only)
//   Close tab  ⌘W
//   Close others                - disabled when the workspace has one chat
// The hints follow the user's key bindings (registry + overrides); with the defaults they
// read as Conductor's fixed "⌘⌥", "⌘⌥C" and "⌘W".
import type { ReactNode } from "react";
import { ContextMenu, MenuItem, MenuSeparator } from "../../components/menu/ContextMenu";
import { CornerDownLeftIcon } from "../../components/menu/menuIcons";
import { splitEnterHint } from "./chatTabMenuRules.ts";
import type { TranscriptMode } from "./transcriptCopy.ts";

export interface ChatTabMenuActions {
  unread: boolean;
  toggleRead: () => void;
  /** Absent while the chat cannot be renamed (shown disabled; issue #523). */
  rename?: () => void;
  /** Shown only while forking to a new tab is on. */
  fork?: { run: () => void; pending: boolean };
  copyTranscript: (mode: TranscriptMode) => void;
  copyLink: () => void;
  /** Conductor's `showClose`: the Close section is shown. */
  showClose: boolean;
  /** Absent while this tab cannot be closed (shown disabled; the workspace chat, issue #524). */
  close?: () => void;
  closeOthers: () => void;
  hasOtherChats: boolean;
}

export interface ChatTabMenuKeys {
  fork?: string;
  copyConcise?: string;
  close?: string;
}

interface Props {
  at: { x: number; y: number };
  actions: ChatTabMenuActions;
  /** Rendered shortcut hints, from the user's key bindings. */
  keys: ChatTabMenuKeys;
  onClose: () => void;
}

export function ChatTabMenu({ at, actions: a, keys, onClose }: Props) {
  return (
    <ContextMenu at={at} label="Chat actions" className="cm-min-w-200" onClose={onClose}>
      <MenuItem onSelect={a.toggleRead}>{a.unread ? "Mark as read" : "Mark as unread"}</MenuItem>
      <MenuItem disabled={!a.rename} onSelect={() => a.rename?.()}>
        Rename chat
      </MenuItem>
      {a.fork && (
        <MenuItem disabled={a.fork.pending} onSelect={a.fork.run} shortcut={enterHint(keys.fork)}>
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
          <MenuItem disabled={!a.close} onSelect={() => a.close?.()} shortcut={keys.close}>
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

/** "⌘⌥" and Conductor's Enter glyph (`gf`: lucide corner-down-left, role img "Enter"). */
function enterHint(text: string | undefined): ReactNode {
  if (!text) return undefined;
  const { prefix, enter } = splitEnterHint(text);
  if (!enter) return text;
  return (
    <>
      {prefix}
      <span role="img" aria-label="Enter" className="cm-enter-glyph">
        <CornerDownLeftIcon />
      </span>
    </>
  );
}
