import { useRef, useState, type Dispatch } from "react";
import { Popover } from "@base-ui/react/popover";
import type { Action } from "../state/store";
import type { Repo, Workspace } from "../state/types";
import type { NavSection } from "../state/navigationSections";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import { WorkspaceContextMenu } from "./WorkspaceContextMenu";
import { WorkspaceDetails } from "./WorkspaceDetails";
import "./workspaceDetails.css";

interface Props {
  repoId: string;
  repo?: Pick<Repo, "name">;
  workspace: Workspace;
  sections: readonly NavSection[];
  dispatch: Dispatch<Action>;
  onNewSection: (workspace: Workspace) => void;
  onCopyLink: (workspace: Workspace) => void;
  onError: (message: string) => void;
}

export function WorkspaceNameHeader({ repoId, repo, workspace, sections, dispatch, onNewSection, onCopyLink, onError }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  return (
    <>
      <Popover.Root
        open={detailsOpen}
        modal={false}
        onOpenChange={(open, details) => {
          if (!open && menu && (details.reason === "focus-out" || details.reason === "escape-key" ||
            (details.event.target instanceof Element && details.event.target.closest("[data-cm-tree]")))) {
            details.cancel();
            return;
          }
          setDetailsOpen(open);
        }}
      >
        <Popover.Trigger
          nativeButton={false}
          render={<strong />}
          className="ws-name-trigger"
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {workspace.name}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="ws-details-positioner" align="start" sideOffset={4}>
            <Popover.Popup ref={popup} initialFocus={popup} className="ws-details" aria-label="Workspace details">
              <WorkspaceDetails
                workspace={workspace}
                repo={repo}
                onRename={() => {
                  setDetailsOpen(false);
                  setRenaming(true);
                }}
                onActions={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMenu({ x: rect.left, y: rect.bottom + 4 });
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
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
