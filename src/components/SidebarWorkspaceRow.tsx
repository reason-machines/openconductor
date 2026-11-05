import { useCallback, useEffect, useState, type Dispatch, type MouseEvent } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { RowStatusIcon } from "./RowStatusIcon";
import { rowStatus, rowStatusColor, rowStatusLabel } from "../state/rowStatus";
import { labelTargetBranch, workspaceLabel } from "./sidebarLabel";
import { useBranchPrefix } from "./useBranchPrefix";
import { WorkspaceActionsMenu } from "./WorkspaceActionsMenu";
import { COMMANDS } from "../keybindings/registry";
import { HINT_DELAY_MS, hintLabel, hintNumbers, holdsExactly } from "../state/shortcutHint";
import { sidebarEntries } from "../state/sidebarOrder";
import { sectionOf } from "../state/navigationSections";
import { compactCount } from "../state/sidebarDiffStat";
import { useRowDiffStat } from "./useRowDiffStat";
import { useWorkspaceSession } from "../features/chat/useWorkspaceSession";
import { applyRowLookup, useRowPrPoll } from "../features/pr/sidebarPrPoller";
import { usePrSettings } from "../features/pr/usePullRequest";
import type { LookupResult } from "../features/pr/types";

interface Props {
  workspace: Workspace;
  /** Branch the row's diff stat is counted against. */
  targetBranch: string;
  /** The repo has a remote: a workspace without a PR shows "Ready" (branch) rather than "Local workspace". */
  hasRemote?: boolean;
  active: boolean;
  onSelect: () => void;
  /** Right-click: opens the workspace actions menu. */
  onContextMenu?: (e: MouseEvent) => void;
  menuOpen?: boolean;
  /** 1..9 for the first nine visible rows (Cmd+N switches to it). */
  shortcutNumber?: number;
  /** The number replaces the icon while the switch modifier is held. */
  showShortcutHint?: boolean;
  /** The repository's folder, for the row's background PR lookup. */
  repoPath?: string;
  /** A background PR lookup for this row came back. */
  onPrLookup?: (r: LookupResult) => void;
  /** Branch prefix stripped from the label's prettified branch. */
  branchPrefix?: string;
}

/** One workspace row in the sidebar (Conductor's `lJn`): status icon, title, diff stat. */
export function SidebarWorkspaceRow({ workspace: ws, targetBranch, hasRemote, active, onSelect, onContextMenu, menuOpen, shortcutNumber, showShortcutHint, repoPath, onPrLookup, branchPrefix }: Props) {
  const hint = showShortcutHint === true && shortcutNumber !== undefined;
  const label = workspaceLabel({
    name: ws.name,
    workspaceName: ws.workspaceName,
    branchPrefix,
    branch: ws.branch,
    prTitle: ws.prTitle,
    userSetWorkspaceName: ws.userSetWorkspaceName,
    targetBranch: labelTargetBranch(ws.targetBranch),
  });
  const { ref, stat, onScreen } = useRowDiffStat(ws, targetBranch, active);
  useRowPrPoll({ ws, repoPath, onScreen, active, onResult: (r) => onPrLookup?.(r) });
  // Every chat of the workspace, open or not, plus `ws.sessionStatus` (the demo's statuses).
  const session = useWorkspaceSession(ws);
  const status = rowStatus({ workspaceState: ws.state, session, pr: ws.pr, hasRemote });
  const statusLabel = rowStatusLabel(status);
  return (
    <button
      ref={ref}
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
      title={`${label} · ${ws.branch} · ${statusLabel}`}
    >
      <span className="sb-ws-lead" data-testid="workspace-leading-visual" data-hint={hint || undefined}>
        <span
          className="sb-ws-status"
          data-testid="workspace-status-icon"
          data-status={status}
          data-color={rowStatusColor(status)}
          role="img"
          aria-label={statusLabel}
          aria-hidden={hint || undefined}
        >
          <RowStatusIcon status={status} />
        </span>
        {shortcutNumber !== undefined && (
          <span className="sb-ws-hint" aria-label={hintLabel(shortcutNumber)} aria-hidden={!hint} data-state={hint ? "visible" : "hidden"}>
            {shortcutNumber}
          </span>
        )}
      </span>
      <span className="sb-ws-name">{label}</span>
      {(stat.added > 0 || stat.removed > 0) && (
        <span className="sb-ws-diff" data-testid="workspace-diff-stat">
          {stat.added > 0 && <span className="add">+{compactCount(stat.added)}</span>}
          {stat.removed > 0 && <span className="del">-{compactCount(stat.removed)}</span>}
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
  /** New section dialog that moves this workspace into the new section. */
  onNewSection?: (ws: Workspace) => void;
  /** Collapsed user sections: their rows get no Cmd+1..9 number. */
  collapsedSections?: ReadonlySet<string>;
}

const SWITCH_MODIFIERS = COMMANDS.find((c) => c.id === "workspace.switchTo1")?.key.modifiers ?? ["meta"];

/** True while the Cmd+1..9 modifier has been held alone for HINT_DELAY_MS. */
export function useShortcutHints(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let held = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => {
      held = false;
      clearTimeout(timer);
      setVisible(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const now = holdsExactly(SWITCH_MODIFIERS, e);
      if (now === held) return;
      held = now;
      if (now) timer = setTimeout(() => setVisible(true), HINT_DELAY_MS);
      else hide();
    };
    const onPointer = (e: globalThis.MouseEvent) => {
      if (!holdsExactly(SWITCH_MODIFIERS, e) && held) hide();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("mousemove", onPointer);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("wheel", onPointer);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", hide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("mousemove", onPointer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("wheel", onPointer);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", hide);
      clearTimeout(timer);
    };
  }, []);
  return visible;
}

type MenuTarget = { repoId: string; workspaceId: string; x: number; y: number };

/**
 * Row props and the open menu for every workspace row in the sidebar.
 * `rowProps(repoId, ws)` gives select (which also clears unread, as opening a
 * workspace's session does in Conductor) and right-click.
 */
export function useWorkspaceRows(state: AppState, dispatch: Dispatch<Action>, { onRename, onArchive, onNewSection, collapsedSections }: RowCallbacks = {}) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const sel = state.selection;
  const close = useCallback(() => setMenu(null), []);
  const hintsVisible = useShortcutHints();
  const numbers = hintNumbers(sidebarEntries(state, { visibleOnly: true, collapsedSections }).map((e) => e.workspace.id));
  const { optionalChecksBlock } = usePrSettings();
  const branchPrefix = useBranchPrefix();

  const rowProps = (repoId: string, ws: Workspace) => ({
    repoPath: state.repos.find((r) => r.id === repoId)?.path || undefined,
    branchPrefix,
    onPrLookup: (r: LookupResult) => applyRowLookup(dispatch, repoId, ws, r, optionalChecksBlock),
    active: sel.kind === "workspace" && sel.workspaceId === ws.id,
    menuOpen: menu?.workspaceId === ws.id,
    shortcutNumber: numbers.get(ws.id),
    showShortcutHint: hintsVisible,
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
        sections={state.sections ?? []}
        currentSectionId={sectionOf(state.sections, ws.id)?.id}
        actions={{
          toggleRead: () => dispatch({ type: "setWorkspaceUnread", ...ids, unread: !ws.unread }),
          togglePin: () => dispatch({ type: "setWorkspacePinned", ...ids, pinned: typeof ws.pinnedAt !== "number" }),
          setStatus: (status) => dispatch({ type: "setWorkspaceStatus", ...ids, status }),
          rename: onRename && (() => onRename(repo.id, ws)),
          archive: () => (onArchive ? onArchive(repo.id, ws) : dispatch({ type: "archiveWorkspace", ...ids })),
          moveToSection: (sectionId) => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId }),
          newSection: () => onNewSection?.(ws),
          removeFromSection: () => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId: null }),
        }}
      />
    );
  }
  return { rowProps, menu: element };
}
