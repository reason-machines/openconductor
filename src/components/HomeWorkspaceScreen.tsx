import { useEffect, useState, type ComponentProps } from "react";
import type { Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { AllWorkspaces } from "./AllWorkspaces";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";

type Props = Omit<ComponentProps<typeof AllWorkspaces>, "onWorkspaceContextMenu" | "onArchivedWorkspaceContextMenu"> & {
  sections: readonly NavSection[];
  onNewSection: (workspace: Workspace) => void;
  onCopyLink: (workspace: Workspace) => void;
  onError: (message: string) => void;
};

// Home's retained _Jo -> EJo -> D9e chain uses the same workspace actions as
// sidebar/header. Archived rows carry their existing row-owned restore action.
export function HomeWorkspaceScreen({ sections, onNewSection, onCopyLink, onError, ...props }: Props) {
  const [menu, setMenu] = useState<{
    repoId: string; workspaceId: string; at: { x: number; y: number };
    archived?: { workspace: Workspace; unarchive: { pending: boolean; run: () => void } };
  } | null>(null);
  const [renaming, setRenaming] = useState<{ repoId: string; workspace: Workspace } | null>(null);
  const repo = menu && props.repos.find((repo) => repo.id === menu.repoId);
  const current = repo?.workspaces.find((workspace) => workspace.id === menu?.workspaceId);
  let target: Workspace | undefined;
  if (menu?.archived) {
    if (repo && (!current || current.status === "archived")) {
      target = current ?? menu.archived.workspace;
    }
  } else if (current && current.status !== "archived" && current.state !== "unstarted") {
    target = current;
  }
  useEffect(() => {
    if (menu && !target) setMenu(null);
  }, [menu, target]);
  return (
    <>
      <AllWorkspaces
        {...props}
        onWorkspaceContextMenu={(row, at) => setMenu({ repoId: row.repo.id, workspaceId: row.workspace.id, at })}
        onArchivedWorkspaceContextMenu={(row, at, unarchive) => setMenu({
          repoId: row.repo.id, workspaceId: row.workspace.id, at,
          archived: { workspace: row.workspace, unarchive },
        })}
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
          unarchive={menu.archived?.unarchive}
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
