import { useSyncExternalStore, type ReactNode } from "react";
import "./pendingWorkspaceRow.css";
import { getPendingLaunches, launchesForRepo, subscribePendingLaunches } from "../workspace/pendingLaunches";

/** Pending launch ids of one repository; re-renders when a launch starts or ends. */
export function usePendingLaunches(repoId: string): string[] {
  return launchesForRepo(useSyncExternalStore(subscribePendingLaunches, getPendingLaunches), repoId);
}

/**
 * The sidebar row of a workspace still being created (Conductor's `Ora`): an
 * inert "Untitled" row with the setting-up loader, labelled
 * "Creating workspace..." for assistive tech. Conductor's loader is an
 * animated sprite; ours is a spinner of the same 14px size and muted colour.
 */
export function PendingWorkspaceRow() {
  return (
    <div className="sb-ws sb-ws-pending" role="status" aria-label="Creating workspace..." data-testid="left-sidebar-pending-workspace">
      <span className="sb-ws-lead" aria-hidden>
        <span className="sb-ws-status setting-up">
          <span className="sb-ws-loader" />
        </span>
      </span>
      <span className="sb-ws-name">Untitled</span>
    </div>
  );
}

interface ListProps {
  repoId: string;
  collapsed: boolean;
  /** Shown when the group has neither workspaces nor pending rows. */
  empty: ReactNode;
  isEmpty: boolean;
  children: ReactNode;
}

/**
 * A repository group's workspace list. Pending rows come first and stay
 * visible while the group is collapsed, as in Conductor's `Dra`
 * (`(!collapsed || pending.length > 0)`, pending rows, then the workspaces).
 */
export function RepoWorkspaceList({ repoId, collapsed, empty, isEmpty, children }: ListProps) {
  const ids = usePendingLaunches(repoId);
  if (collapsed && ids.length === 0) return null;
  return (
    <div className="sb-ws-list">
      {ids.map((id) => (
        <PendingWorkspaceRow key={id} />
      ))}
      {!collapsed && (isEmpty && ids.length === 0 ? empty : children)}
    </div>
  );
}
