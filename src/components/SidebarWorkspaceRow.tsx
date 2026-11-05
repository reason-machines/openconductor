import { useCallback, useState, type Dispatch, type MouseEvent } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { BranchIcon } from "./Icons";
import { workspaceLabel } from "./sidebarLabel";
import { WorkspaceActionsMenu } from "./WorkspaceActionsMenu";

const STATUS_LABEL: Record<Workspace["status"], string> = {
  idle: "Idle",
  working: "Working",
  "needs-review": "Ready for review",
  archived: "Archived",
};

interface Props {
  workspace: Workspace;
  /** Branch the workspace merges into; a branch equal to it is not used as the title. */
  targetBranch: string;
  active: boolean;
  onSelect: () => void;
  /** Right-click: opens the workspace actions menu. */
  onContextMenu?: (e: MouseEvent) => void;
  menuOpen?: boolean;
}

/** One workspace row in the sidebar (Conductor's `lJn`): status icon, title, diff stat. */
export function SidebarWorkspaceRow({ workspace: ws, targetBranch, active, onSelect, onContextMenu, menuOpen }: Props) {
  const label = workspaceLabel({ name: ws.name, branch: ws.branch, prTitle: ws.prTitle, userSetWorkspaceName: ws.userSetWorkspaceName, targetBranch });
  return (
    <button
      type="button"
      className="sb-ws"
      data-testid="left-sidebar-workspace-item"
      data-active={active || undefined}
      data-unread={ws.unread || undefined}
      data-pinned={typeof ws.pinnedAt === "number" || undefined}
      data-menu-open={menuOpen || undefined}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={`${label} · ${ws.branch} · ${STATUS_LABEL[ws.status]}`}
    >
      <span className={`sb-ws-status ${ws.status}`} role="img" aria-label={STATUS_LABEL[ws.status]}>
        <BranchIcon size={14} />
      </span>
      <span className="sb-ws-name">{label}</span>
      {(ws.diff.added > 0 || ws.diff.removed > 0) && (
        <span className="sb-ws-diff">
          <span className="add">+{ws.diff.added}</span> <span className="del">-{ws.diff.removed}</span>
        </span>
      )}
    </button>
  );
}

export interface RowCallbacks {
  /** Rename dialog; the menu hides Rename until one is passed. */
  onRename?: (repoId: string, ws: Workspace) => void;
  /** Archive flow; defaults to the store's archiveWorkspace. */
  onArchive?: (repoId: string, ws: Workspace) => void;
}

type MenuTarget = { repoId: string; workspaceId: string; x: number; y: number };

/**
 * Row props and the open menu for every workspace row in the sidebar.
 * `rowProps(repoId, ws)` gives select (which also clears unread, as opening a
 * workspace's session does in Conductor) and right-click.
 */
export function useWorkspaceRows(state: AppState, dispatch: Dispatch<Action>, { onRename, onArchive }: RowCallbacks = {}) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const sel = state.selection;
  const close = useCallback(() => setMenu(null), []);

  const rowProps = (repoId: string, ws: Workspace) => ({
    active: sel.kind === "workspace" && sel.workspaceId === ws.id,
    menuOpen: menu?.workspaceId === ws.id,
    onSelect: () => {
      dispatch({ type: "select", selection: { kind: "workspace", repoId, workspaceId: ws.id } });
      if (ws.unread) dispatch({ type: "setWorkspaceUnread", repoId, workspaceId: ws.id, unread: false });
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      setMenu({ repoId, workspaceId: ws.id, x: e.clientX, y: e.clientY });
    },
  });

  let element: JSX.Element | null = null;
  const repo = menu && state.repos.find((r) => r.id === menu.repoId);
  const ws = menu && repo?.workspaces.find((w) => w.id === menu.workspaceId);
  if (menu && repo && ws) {
    const ids = { repoId: repo.id, workspaceId: ws.id };
    element = (
      <WorkspaceActionsMenu
        key={ws.id}
        workspace={ws}
        selected={sel.kind === "workspace" && sel.workspaceId === ws.id}
        at={{ x: menu.x, y: menu.y }}
        onClose={close}
        actions={{
          toggleRead: () => dispatch({ type: "setWorkspaceUnread", ...ids, unread: !ws.unread }),
          togglePin: () => dispatch({ type: "setWorkspacePinned", ...ids, pinned: typeof ws.pinnedAt !== "number" }),
          setStatus: (status) => dispatch({ type: "setWorkspaceStatus", ...ids, status }),
          rename: onRename && (() => onRename(repo.id, ws)),
          archive: () => (onArchive ? onArchive(repo.id, ws) : dispatch({ type: "archiveWorkspace", ...ids })),
        }}
      />
    );
  }
  return { rowProps, menu: element };
}
