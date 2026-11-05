// parity:home.dashboard-routes
// Conductor's /dashboard screen (`lta`, decoded renderApp-D_fmY7hW.js
// @9,906,285; route `J7a` @11,520,499): a sticky "Dashboard" bar, project tabs
// when there is more than one project (`dta` / `hta`), then a board of the
// non-archived workspaces in five status columns (`_ta` / `bta`). Dragging a
// card to another column sets its status (`updateWorkspaceManualStatus`);
// clicking it opens the workspace. With the Experimental "Dashboard" setting
// off the screen sends the app back to `/`. Logic and evidence:
// src/home/dashboard.ts, evidence/screens/dashboard.md.

import { useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { WORKSPACE_STATUSES, statusLabel, type WorkspaceStatusValue } from "../state/workspaceStatus";
import {
  COLUMN_PAGE,
  agoTime,
  boardCards,
  columnPage,
  dropTarget,
  groupBoard,
  lastActive,
  livePending,
  projectTabs,
  pullRequestUrl,
  selectedProject,
  showsPrRow,
  type BoardCard,
  type PendingMove,
} from "../home/dashboard";
import { useDashboardEnabled } from "../home/useDashboardEnabled";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { openUrl } from "../backend";
import { ChevronDownIcon, ExternalIcon, SidebarIcon } from "./Icons";
import { RepoIcon } from "./RepoIcon";
import { RenameWorkspaceDialog } from "./RenameWorkspaceDialog";
import "./dashboard.css";

interface Props {
  repos: Repo[];
  /** The `?repo=` project tab. */
  repo?: string;
  sidebarVisible: boolean;
  dispatch: Dispatch<Action>;
  onCreateWorkspace: (repoId?: string) => void;
  onError: (message: string) => void;
}

const StatusDot = ({ status }: { status: WorkspaceStatusValue }) => <span className={`sb-status-dot status-${status}`} aria-hidden />;

export function Dashboard({ repos, repo, sidebarVisible, dispatch, onCreateWorkspace, onError }: Props) {
  const { enabled, ready } = useDashboardEnabled();
  const [pending, setPending] = useState<PendingMove>();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<WorkspaceStatusValue | null>(null);
  const [renaming, setRenaming] = useState<{ repoId: string; workspaceId: string } | null>(null);

  // Off: back to `/`, once the stored value is known (`n && !i` -> Navigate to "/").
  useEffect(() => {
    if (ready && !enabled) dispatch({ type: "select", selection: { kind: "root" } });
  }, [ready, enabled, dispatch]);

  const cards = useMemo(() => boardCards(repos, repo), [repos, repo]);
  const live = livePending(cards, pending);
  const board = useMemo(() => groupBoard(cards, live), [cards, live]);
  const selected = selectedProject(repos, repo);
  const tabs = projectTabs(repos, selected);
  const setRepo = (id: string | undefined) => dispatch({ type: "select", selection: id ? { kind: "dashboard", repo: id } : { kind: "dashboard" } });
  const open = (c: BoardCard) => dispatch({ type: "select", selection: { kind: "workspace", repoId: c.repoId, workspaceId: c.workspace.id } });
  const setStatus = (c: BoardCard, status: WorkspaceStatusValue) => dispatch({ type: "setWorkspaceStatus", repoId: c.repoId, workspaceId: c.workspace.id, status });

  const drop = (column: WorkspaceStatusValue) => {
    const card = cards.find((c) => c.workspace.id === dragging);
    setDragging(null);
    setOver(null);
    const status = dropTarget(card, live, column);
    if (!card || !status) return;
    setPending({ workspaceId: card.workspace.id, status });
    setStatus(card, status);
  };

  const renamingWs = renaming && repos.find((r) => r.id === renaming.repoId)?.workspaces.find((w) => w.id === renaming.workspaceId);
  const toggleHint = effectiveShortcuts("view.toggleLeftSidebar").map(glyphs).join(" or ");
  if (ready && !enabled) return null;

  return (
    <div className="dash">
      <div className="dash-bar" data-tauri-drag-region>
        <div className="dash-bar-inner">
          {!sidebarVisible && (
            <button type="button" className="dash-sidebar-toggle" aria-label="Toggle left sidebar" title={`Toggle left sidebar ${toggleHint}`} onClick={() => dispatch({ type: "toggleSidebar" })}>
              <SidebarIcon size={16} />
            </button>
          )}
          <h1 className="dash-title">Dashboard</h1>
        </div>
      </div>

      {tabs.show && (
        <div className="dash-tabs">
          <div className="dash-tablist" role="tablist" aria-label="Projects">
            <button type="button" role="tab" className="dash-tab" aria-selected={selected === undefined} onClick={() => setRepo(undefined)}>
              All projects
            </button>
            {tabs.tabs.map((r) => (
              <button key={r.id} type="button" role="tab" className="dash-tab" aria-selected={selected === r.id} onClick={() => setRepo(r.id)}>
                <RepoIcon repo={r} className="dash-repo-icon" />
                {r.name}
              </button>
            ))}
          </div>
          {tabs.more.length > 0 && <MoreProjects repos={tabs.more} active={tabs.moreActive} label={tabs.moreLabel} onPick={setRepo} />}
        </div>
      )}

      <div className="dash-board-scroll">
        {cards.length === 0 ? (
          <div className="dash-empty">
            <button type="button" className="dash-new" onClick={() => onCreateWorkspace(selected)}>
              New workspace
            </button>
          </div>
        ) : (
          <div className="dash-board">
            {WORKSPACE_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                cards={board[status]}
                dragActive={dragging !== null}
                over={over === status}
                onDragOver={() => setOver(status)}
                onDragLeave={() => setOver((o) => (o === status ? null : o))}
                onDrop={() => drop(status)}
              >
                {(c) => (
                  <Card
                    key={c.workspace.id}
                    card={c}
                    remote={repos.find((r) => r.id === c.repoId)?.remote}
                    dragging={dragging === c.workspace.id}
                    onOpen={() => open(c)}
                    onRename={() => setRenaming({ repoId: c.repoId, workspaceId: c.workspace.id })}
                    onStatus={(s) => setStatus(c, s)}
                    onDragStart={() => setDragging(c.workspace.id)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                )}
              </Column>
            ))}
          </div>
        )}
      </div>
      {renaming && renamingWs && (
        <RenameWorkspaceDialog repoId={renaming.repoId} workspace={renamingWs} dispatch={dispatch} onClose={() => setRenaming(null)} onError={onError} />
      )}
    </div>
  );
}

/** One status column (`bta`): icon, title and count, ten cards then "Show N more", and the "Move to" drop hint. */
function Column({
  status,
  cards,
  dragActive,
  over,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  status: WorkspaceStatusValue;
  cards: BoardCard[];
  dragActive: boolean;
  over: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  children: (c: BoardCard) => JSX.Element;
}) {
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = columnPage(cards, expanded);
  const title = statusLabel(status);
  return (
    <section
      className="dash-col"
      aria-label={title}
      data-status={status}
      onDragOver={(e) => {
        if (!dragActive) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) onDragOver();
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onDragLeave();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="dash-col-head">
        <StatusDot status={status} />
        <h2 className="dash-col-title">{title}</h2>
        <span className="dash-col-count">{cards.length}</span>
      </div>
      <div className="dash-col-body">
        <div className="dash-col-list">
          {shown.map(children)}
          {cards.length > COLUMN_PAGE && (
            <button type="button" className="dash-more" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show less" : `Show ${hidden} more`}
            </button>
          )}
        </div>
        <div className="dash-drop" data-over={(dragActive && over) || undefined} aria-hidden>
          <span className="dash-drop-pill">Move to {title}</span>
        </div>
      </div>
    </section>
  );
}

/** A workspace card (`gta` around `_Fi`): name, diff stat and status picker; branch; PR link and time. */
function Card({
  card,
  remote,
  dragging,
  onOpen,
  onRename,
  onStatus,
  onDragStart,
  onDragEnd,
}: {
  card: BoardCard;
  remote?: string;
  dragging: boolean;
  onOpen: () => void;
  onRename: () => void;
  onStatus: (s: WorkspaceStatusValue) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const w: Workspace = card.workspace;
  const hasChanges = w.diff.added + w.diff.removed > 0;
  const prUrl = w.pr ? pullRequestUrl(remote, w.pr.number) : undefined;
  return (
    <div
      className="dash-card"
      role="button"
      tabIndex={0}
      draggable
      data-dragging={dragging || undefined}
      data-testid="dashboard-card"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.defaultPrevented || e.key !== "Enter") return;
        e.preventDefault();
        onOpen();
      }}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", w.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="dash-card-top">
        <div className="dash-card-name-row">
          <span
            className="dash-card-name"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            {w.name}
          </span>
          {hasChanges && (
            <span className="dash-card-diff">
              <span className="dash-add">+{w.diff.added}</span>
              <span className="dash-del">-{w.diff.removed}</span>
            </span>
          )}
        </div>
        <StatusPicker status={card.status} onPick={onStatus} />
      </div>
      <div className="dash-card-branch">{w.branch || w.placeholderBranchName}</div>
      <div className="dash-card-foot">
        {showsPrRow(w) && w.pr && prUrl && (
          <button
            type="button"
            className="dash-pr"
            onClick={(e) => {
              e.stopPropagation();
              void openUrl(prUrl);
            }}
          >
            <span>#{w.pr.number}</span>
            <ExternalIcon size={10} />
          </button>
        )}
        <span className="dash-time">{agoTime(lastActive(w))}</span>
      </div>
    </div>
  );
}

/** The card's status button and menu (`yZo`): the five statuses, a check on the current one. */
function StatusPicker({ status, onPick }: { status: WorkspaceStatusValue; onPick: (s: WorkspaceStatusValue) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="dash-status" ref={ref}>
      <button
        type="button"
        className="dash-status-btn"
        aria-label={`Status: ${statusLabel(status)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <StatusDot status={status} />
      </button>
      {open && (
        <div className="dash-menu" role="menu" aria-label="Set status" onClick={(e) => e.stopPropagation()}>
          {WORKSPACE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              className="dash-menu-item"
              data-selected={s === status || undefined}
              onClick={() => {
                onPick(s);
                setOpen(false);
              }}
            >
              <StatusDot status={s} />
              <span className="dash-menu-label">{statusLabel(s)}</span>
              {s === status && <span className="dash-menu-check" aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "More" (`hta`): projects past the first five; shows the picked one's name when it is active. */
function MoreProjects({ repos, active, label, onPick }: { repos: Repo[]; active: boolean; label: string; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="dash-status" ref={ref}>
      <button type="button" className="dash-more-tab" data-active={active || undefined} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="dash-menu dash-menu-wide" role="menu">
          {repos.map((r) => (
            <button
              key={r.id}
              type="button"
              role="menuitem"
              className="dash-menu-item"
              onClick={() => {
                onPick(r.id);
                setOpen(false);
              }}
            >
              <RepoIcon repo={r} className="dash-repo-icon" />
              <span className="dash-menu-label">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}
