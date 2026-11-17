import { useEffect, useState, type ComponentProps } from "react";
import type { Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { AllWorkspaces } from "./AllWorkspaces";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";

type Props = Omit<ComponentProps<typeof AllWorkspaces>, "onWorkspaceContextMenu"> & {
  sections: readonly NavSection[];
  onNewSection: (workspace: Workspace) => void;
  onCopyLink: (workspace: Workspace) => void;
  onError: (message: string) => void;
};

// Home's retained _Jo -> EJo -> D9e chain uses the same workspace actions as
// sidebar/header. This integration intentionally covers active local rows only.
export function HomeWorkspaceScreen({ sections, onNewSection, onCopyLink, onError, ...props }: Props) {
  const [menu, setMenu] = useState<{ repoId: string; workspaceId: string; at: { x: number; y: number } } | null>(null);
  const [renaming, setRenaming] = useState<{ repoId: string; workspace: Workspace } | null>(null);
  const target = menu && props.repos.find((repo) => repo.id === menu.repoId)?.workspaces.find((workspace) =>
    workspace.id === menu.workspaceId && workspace.status !== "archived" && workspace.state !== "unstarted");
  useEffect(() => {
    if (menu && !target) setMenu(null);
  }, [menu, target]);
  return (
    <>
      <AllWorkspaces
        {...props}
        onWorkspaceContextMenu={(row, at) => setMenu({ repoId: row.repo.id, workspaceId: row.workspace.id, at })}
      />
      {menu && target && (
        <WorkspaceContextMenu
          repoId={menu.repoId}
          workspace={target}
          selected={false}
          at={menu.at}
          sections={sections}
          dispatch={props.dispatch}
          onClose={() => setMenu(null)}
          onRename={() => setRenaming({ repoId: menu.repoId, workspace: target })}
          onNewSection={onNewSection}
          onCopyLink={onCopyLink}
        />
      )}
      {renaming && (
        <RenameWorkspaceDialog
          repoId={renaming.repoId}
          workspace={renaming.workspace}
          dispatch={props.dispatch}
          onClose={() => setRenaming(null)}
          onError={onError}
        />
      )}
    </>
  );
}
