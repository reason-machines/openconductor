import { useCallback, useEffect, useState, type Dispatch, type MouseEvent, type PointerEvent } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { RowStatusIcon } from "./RowStatusIcon";
import { rowGitStatus, rowStatus, rowStatusColor, rowStatusLabel } from "../state/rowStatus";
import { StatusMatrix } from "./StatusMatrix";
import { useStatusMatrix } from "../settings/useStatusMatrix";
import { labelTargetBranch, workspaceLabel } from "./sidebarLabel";
import { useBranchPrefix } from "./useBranchPrefix";
import { WorkspaceActionsMenu } from "./WorkspaceActionsMenu";
import { COMMANDS } from "../keybindings/registry";
import { HINT_DELAY_MS, hintLabel, hintNumbers, holdsExactly } from "../state/shortcutHint";
import { sidebarEntries } from "../state/sidebarOrder";
import { sectionOf } from "../state/navigationSections";
import { compactCount } from "../state/sidebarDiffStat";
import { useRowDiffStat } from "./useRowDiffStat";
import { useWorkspaceAgentStatus } from "../features/chat/useWorkspaceSession";
import { applyRowLookup, useRowPrPoll } from "../features/pr/sidebarPrPoller";
import { usePrSettings } from "../features/pr/usePullRequest";
import type { LookupResult } from "../features/pr/types";
import { clearManuallyUnreadForWorkspace, markManuallyUnread, selectedChatOf } from "../state/autoUnread";
import { attentionChat, isWorkspaceUnread } from "../state/chatUnread";
import { requestChat, workspaceChats } from "../state/openChat";
import { chatStatuses } from "../features/chat/chatRuntime";
import { Tooltip } from "./Tooltip";
import { ArchiveIcon } from "./Icons";
import { glyphs } from "../keybindings/shortcut";

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
  /** A press that may become a drag onto a section, Pinned or My workspaces. */
  onPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  /** Archive this workspace: the hover button at the row's right end (Conductor's `iea`). */
  onArchive?: () => void;
}

const ARCHIVE_COMMAND = COMMANDS.find((c) => c.id === "workspace.archive");
const ARCHIVE_SHORTCUT = ARCHIVE_COMMAND ? glyphs(ARCHIVE_COMMAND.key) : undefined;

/**
 * One workspace row in the sidebar (Conductor's `lJn`): status icon, title, diff stat,
 * and the Archive button that replaces the diff stat while the row is hovered.
 */
export function SidebarWorkspaceRow({ workspace: ws, targetBranch, hasRemote, active, onSelect, onContextMenu, menuOpen, shortcutNumber, showShortcutHint, repoPath, onPrLookup, branchPrefix, onPointerDown, onArchive }: Props) {
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
  // Every chat of the workspace, open or not, plus what the open view reports (and the demo's "working").
  const session = useWorkspaceAgentStatus(ws);
  const status = rowStatus({ workspaceState: ws.state, session, pr: ws.pr, hasRemote });
  const statusLabel = rowStatusLabel(status);
  // Settings › Experimental › Workspace status matrix: the matrix with the PR's status and unread folded in (`hWt`).
  const matrix = useStatusMatrix();
  return (
    <div className="sb-ws-row">
      <button
        ref={ref}
        type="button"
        className="sb-ws"
        data-testid="left-sidebar-workspace-item"
        data-active={active || undefined}
        data-unread={isWorkspaceUnread(ws) || undefined}
        data-pinned={typeof ws.pinnedAt === "number" || undefined}
        data-menu-open={menuOpen || undefined}
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        title={`${label} · ${ws.branch} · ${statusLabel}`}
      >
        <span className="sb-ws-lead" data-testid="workspace-leading-visual" data-hint={hint || undefined}>
          <span
            className="sb-ws-status"
            data-testid="workspace-status-icon"
            data-status={status}
            data-color={matrix ? undefined : rowStatusColor(status)}
            data-matrix={matrix || undefined}
            role={matrix ? undefined : "img"}
            aria-label={matrix ? undefined : statusLabel}
            aria-hidden={hint || undefined}
          >
            {matrix ? (
              <StatusMatrix status={status} gitStatus={rowGitStatus({ pr: ws.pr, hasRemote })} hasUnread={isWorkspaceUnread(ws)} />
            ) : (
              <RowStatusIcon status={status} />
            )}
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
      {onArchive && (
        <div className="sb-ws-archive">
          {/* Conductor shows the shortcut in the tooltip only on the selected row, since ⌘⇧A archives the open workspace. */}
          <Tooltip content="Archive workspace" shortcut={active ? ARCHIVE_SHORTCUT : undefined}>
            <button
              type="button"
              aria-label="Archive workspace"
              data-testid="workspace-archive-button"
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
            >
              <ArchiveIcon size={12} />
            </button>
          </Tooltip>
        </div>
      )}
    </div>
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
  /** Row press, for dragging rows onto sections (useSidebarDrag.tsx). */
  onRowPointerDown?: (e: PointerEvent<HTMLButtonElement>, repoId: string, ws: Workspace) => void;
  /** Copy link; the menu hides the item until one is passed. */
  onCopyLink?: (ws: Workspace) => void;
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
 * `rowProps(repoId, ws)` gives select and right-click. As in Conductor (renderApp
 * @9,885,472), a click on another workspace's row opens it (showing a chat reads it,
 * autoUnread's readOnView); a click on the open workspace's row opens its first chat
 * that is unread or waits on the user (`fea`) and marks it read.
 */
export function useWorkspaceRows(state: AppState, dispatch: Dispatch<Action>, { onRename, onArchive, onNewSection, collapsedSections, onRowPointerDown, onCopyLink }: RowCallbacks = {}) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const sel = state.selection;
  const close = useCallback(() => setMenu(null), []);
  const hintsVisible = useShortcutHints();
  const numbers = hintNumbers(sidebarEntries(state, { visibleOnly: true, collapsedSections }).map((e) => e.workspace.id));
  const { optionalChecksBlock } = usePrSettings();
  const branchPrefix = useBranchPrefix();

  const archive = (repoId: string, ws: Workspace) =>
    onArchive ? onArchive(repoId, ws) : dispatch({ type: "archiveWorkspace", repoId, workspaceId: ws.id });

  const rowProps = (repoId: string, ws: Workspace) => ({
    onArchive: () => archive(repoId, ws),
    repoPath: state.repos.find((r) => r.id === repoId)?.path || undefined,
    branchPrefix,
    onPrLookup: (r: LookupResult) => applyRowLookup(dispatch, repoId, ws, r, optionalChecksBlock),
    active: sel.kind === "workspace" && sel.workspaceId === ws.id,
    menuOpen: menu?.workspaceId === ws.id,
    shortcutNumber: numbers.get(ws.id),
    showShortcutHint: hintsVisible,
    onSelect: () => {
      if (!(sel.kind === "workspace" && sel.workspaceId === ws.id)) {
        dispatch({ type: "select", selection: { kind: "workspace", repoId, workspaceId: ws.id } });
        return;
      }
      const chat = attentionChat(ws, workspaceChats(ws.id), chatStatuses());
      if (!chat) return;
      if (chat.unread) dispatch({ type: "setChatUnread", repoId, workspaceId: ws.id, chatId: chat.id, unread: false, at: Date.now() });
      requestChat(chat.id);
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      setMenu({ repoId, workspaceId: ws.id, x: e.clientX, y: e.clientY });
    },
    onPointerDown: onRowPointerDown && ((e: PointerEvent<HTMLButtonElement>) => onRowPointerDown(e, repoId, ws)),
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
          toggleRead: () => {
            // Conductor's row menu (renderApp @7,306,180): an unread workspace is read whole
            // (markWorkspaceAsRead, and its hand marks go); otherwise its selected chat is
            // marked unread by hand, which sticks while it is on screen.
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
          rename: onRename && (() => onRename(repo.id, ws)),
          copyLink: onCopyLink && (() => onCopyLink(ws)),
          archive: () => archive(repo.id, ws),
          moveToSection: (sectionId) => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId }),
          newSection: () => onNewSection?.(ws),
          removeFromSection: () => dispatch({ type: "assignSection", workspaceId: ws.id, sectionId: null }),
        }}
      />
    );
  }
  return { rowProps, menu: element };
}
