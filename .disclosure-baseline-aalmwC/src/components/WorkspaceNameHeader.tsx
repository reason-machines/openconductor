import { useState, type Dispatch } from "react";
import type { Action } from "../state/store";
import type { Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";

interface Props {
  repoId: string;
  workspace: Workspace;
  sections: readonly NavSection[];
  dispatch: Dispatch<Action>;
  onNewSection: (workspace: Workspace) => void;
  onCopyLink: (workspace: Workspace) => void;
  onError: (message: string) => void;
}

export function WorkspaceNameHeader({ repoId, workspace, sections, dispatch, onNewSection, onCopyLink, onError }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  return (
    <>
      <strong
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        {workspace.name}
      </strong>
      {menu && (
        <WorkspaceContextMenu
          repoId={repoId}
          workspace={workspace}
          selected
          at={menu}
          sections={sections}
          dispatch={dispatch}
          onClose={() => setMenu(null)}
          onRename={() => setRenaming(true)}
          onNewSection={onNewSection}
          onCopyLink={onCopyLink}
        />
      )}
      {renaming && (
        <RenameWorkspaceDialog
          repoId={repoId}
          workspace={workspace}
          dispatch={dispatch}
          onClose={() => setRenaming(false)}
          onError={onError}
        />
      )}
    </>
  );
}
