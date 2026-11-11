import type { Dispatch } from "react";
import type { Action } from "../state/store";
import type { Workspace } from "../state/types";
import { sectionOf, type NavSection } from "../state/navigationSections";
import { clearManuallyUnreadForWorkspace, markManuallyUnread, selectedChatOf } from "../state/autoUnread";
import { isWorkspaceUnread } from "../state/chatUnread";
import { WorkspaceActionsMenu } from "./WorkspaceActionsMenu";

interface Props {
  repoId: string;
  workspace: Workspace;
  selected: boolean;
  at: { x: number; y: number };
  sections: readonly NavSection[];
  dispatch: Dispatch<Action>;
  onClose: () => void;
  onRename?: (repoId: string, workspace: Workspace) => void;
  onArchive?: (repoId: string, workspace: Workspace) => void;
  onCopyLink?: (workspace: Workspace) => void;
  onNewSection?: (workspace: Workspace) => void;
}

export function WorkspaceContextMenu({ repoId, workspace: ws, selected, at, sections, dispatch, onClose, onRename, onArchive, onCopyLink, onNewSection }: Props) {
  const ids = { repoId, workspaceId: ws.id };
  return (
    <WorkspaceActionsMenu
      workspace={ws}
      selected={selected}
      at={at}
      onClose={onClose}
      sections={sections}
      currentSectionId={sectionOf(sections, ws.id)?.id}
      actions={{
        toggleRead: () => {
          if (isWorkspaceUnread(ws)) {
            clearManuallyUnreadForWorkspace(ws.id);
            dispatch({ type: "markWorkspaceRead", ...ids });
          } else {
            const chatId = selectedChatOf(ws.id);
            markManuallyUnread(chatId);
            dispatch({ type: "setChatUnread", ...ids, chatId, unread: true, at: Date.now() });
          }
        },
        togglePin: () => dispatch({ type: "setWorkspacePinned", ...ids, pinned: typeof ws.pinnedAt !== "number" }),
        setStatus: (status) => dispatch({ type: "setWorkspaceStatus", ...ids, status }),
        rename: onRename && (() => onRename(repoId, ws)),
        copyLink: onCopyLink && (() => onCopyLink(ws)),
        archive: () => onArchive ? onArchive(repoId, ws) : dispatch({ type: "archiveWorkspace", ...ids }),
        moveToSection: (sectionId) => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId }),
        newSection: () => onNewSection?.(ws),
        removeFromSection: () => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId: null }),
      }}
    />
  );
}
