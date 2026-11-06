// Home with workspaces: Conductor's /all-workspaces screen (`UJo`), which its
// sidebar Home row and nav.home open. Header "Home" + Create workspace, a
// search box with project and archive filters, then rows grouped by day.
// Logic and evidence: src/home/allWorkspaces.ts.

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, ChevronDownIcon, FolderIcon, SearchIcon, SidebarIcon } from "./Icons";
import {
  ARCHIVE_FILTERS,
  ARCHIVE_FILTER_LABELS,
  CLEARED_FILTERS,
  PAGE_SIZE,
  emptyAction,
  groupByDate,
  homeRows,
  loadFilters,
  projectFilterLabel,
  reposWithWorkspaces,
  saveFilters,
  shortRelativeTime,
  showProjectFilter,
  toggleProject,
  type FieldMatch,
  type HomeFilters,
  type HomeRow,
} from "../home/allWorkspaces";
import { effectiveShortcuts } from "../keybindings/overrides";
import { useWorkspaceAgentStatus } from "../features/chat/useWorkspaceSession";
import { homeStatus, rowStatusColor, rowStatusLabel, showsActivityStatus } from "../state/rowStatus";
import { RowStatusIcon } from "./RowStatusIcon";
import { glyphs } from "../keybindings/shortcut";

interface Props {
  repos: Repo[];
  sidebarVisible: boolean;
  dispatch: Dispatch<Action>;
  onCreateWorkspace: () => void;
}

function Highlight({ match, fallback }: { match?: FieldMatch; fallback: string }) {
  if (!match) return <>{fallback}</>;
  const marked = new Set(match.indices);
  return (
    <>
      {Array.from(match.text).map((ch, i) => (marked.has(i) ? <mark key={i} className="allws-hit">{ch}</mark> : <span key={i}>{ch}</span>))}
    </>
  );
}

function Menu({ label, icon, ariaLabel, children }: { label: string; icon: ReactNode; ariaLabel: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="allws-menu" ref={ref}>
      <button type="button" className="allws-filter" aria-label={ariaLabel} aria-haspopup="menu" aria-expanded={open} data-open={open || undefined} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span className="allws-filter-label">{label}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="allws-menu-pop" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuCheck({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={checked} className="allws-menu-item" onClick={onClick}>
      <span className="allws-check" aria-hidden>{checked ? "✓" : ""}</span>
      {children}
    </button>
  );
}

function Row({ row, showRepoIcon, active, now, onOpen }: { row: HomeRow; showRepoIcon: boolean; active: boolean; now: number; onOpen: () => void }) {
  const { workspace: ws, repo, archived, matches } = row;
  const tone = archived ? "is-archived" : ws.unread ? "is-unread" : "";
  // Conductor's Home row (`vJo`): the agent's or setup's status, else the last-activity time.
  const status = homeStatus(ws.state, useWorkspaceAgentStatus(ws));
  const statusLabel = rowStatusLabel(status);
  return (
    <div
      role="option"
      aria-selected={active}
      data-selected={active || undefined}
      className="allws-row"
      onClick={onOpen}
      title={row.title}
    >
      <div className="allws-row-main">
        {showRepoIcon && (
          <span className="allws-repo-initial" title={repo.name} aria-hidden>
            {repo.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className={`allws-name ${tone}`}>
          <Highlight match={matches?.name} fallback={row.title} />
        </span>
      </div>
      <div className="allws-row-meta">
        <span className="allws-diff">
          {(ws.diff.added > 0 || ws.diff.removed > 0) && (
            <>
              <span className="add">+{ws.diff.added}</span> <span className="del">-{ws.diff.removed}</span>
            </>
          )}
        </span>
        <span className="allws-when">
          {archived ? (
            <span className="allws-archived" title="Archived" aria-label="Archived">
              <ArchiveIcon size={14} />
            </span>
          ) : showsActivityStatus(status) ? (
            <span className="allws-status" data-testid="home-workspace-status" data-status={status} data-color={rowStatusColor(status)} role="img" title={statusLabel} aria-label={statusLabel}>
              <RowStatusIcon status={status} />
            </span>
          ) : (
            shortRelativeTime(row.lastActiveAt, now)
          )}
        </span>
      </div>
    </div>
  );
}

export function AllWorkspaces({ repos, sidebarVisible, dispatch, onCreateWorkspace }: Props) {
  const [query, setQuery] = useState("");
  const repoIds = useMemo(() => new Set(repos.map((r) => r.id)), [repos]);
  const [filters, setFiltersState] = useState<HomeFilters>(() => loadFilters(repoIds));
  const setFilters = (f: HomeFilters) => {
    setFiltersState(f);
    saveFilters(f);
  };
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [activeIndex, setActiveIndex] = useState(0);
  const sentinel = useRef<HTMLDivElement>(null);
  const now = Date.now();

  useEffect(() => setLimit(PAGE_SIZE), [query, filters]);

  const rows = useMemo(() => homeRows(repos, filters, query), [repos, filters, query]);
  const shown = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const groups = groupByDate(shown, now);
  const flat = groups.flatMap((g) => g.rows);
  const projectChoices = reposWithWorkspaces(repos);
  const empty = emptyAction(repos, filters);

  useEffect(() => setActiveIndex(0), [query, filters]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && setLimit((n) => n + PAGE_SIZE), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  const open = (row: HomeRow) => dispatch({ type: "select", selection: { kind: "workspace", repoId: row.repo.id, workspaceId: row.workspace.id } });

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = flat[activeIndex];
      if (row) open(row);
    }
  };

  const toggleHint = effectiveShortcuts("view.toggleLeftSidebar").map(glyphs).join(" or ");
  let index = -1;

  return (
    <div className="allws">
      <div className="allws-top" data-tauri-drag-region>
        {!sidebarVisible && (
          <button
            type="button"
            className="home-sidebar-toggle"
            title={`Toggle left sidebar (${toggleHint})`}
            aria-label="Toggle left sidebar"
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        )}
        <div className="allws-header">
          <h1 className="allws-title">Home</h1>
          <button type="button" className="allws-create" onClick={onCreateWorkspace}>
            Create workspace
          </button>
        </div>
        <div className="allws-toolbar">
          <div className="allws-toolbar-inner">
            <label className="allws-search">
              <SearchIcon size={14} />
              <input
                autoFocus
                placeholder="Search"
                aria-label="Search workspaces"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKey}
              />
            </label>
            {showProjectFilter(repos) && (
              <Menu ariaLabel="Projects" label={projectFilterLabel(repos, filters.projects)} icon={<FolderIcon size={14} />}>
                {() => (
                  <>
                    <MenuCheck checked={filters.projects.length === 0} onClick={() => setFilters({ ...filters, projects: [] })}>
                      All projects
                    </MenuCheck>
                    {projectChoices.map((r) => (
                      <MenuCheck key={r.id} checked={filters.projects.includes(r.id)} onClick={() => setFilters({ ...filters, projects: toggleProject(filters.projects, r.id) })}>
                        <span className="allws-repo-initial" aria-hidden>{r.name.charAt(0).toUpperCase()}</span>
                        {r.name}
                      </MenuCheck>
                    ))}
                  </>
                )}
              </Menu>
            )}
            <Menu ariaLabel="Archived workspaces" label={ARCHIVE_FILTER_LABELS[filters.archiveFilter]} icon={<ArchiveIcon size={14} />}>
              {(close) =>
                ARCHIVE_FILTERS.map((f) => (
                  <MenuCheck
                    key={f}
                    checked={filters.archiveFilter === f}
                    onClick={() => {
                      setFilters({ ...filters, archiveFilter: f });
                      close();
                    }}
                  >
                    {ARCHIVE_FILTER_LABELS[f]}
                  </MenuCheck>
                ))
              }
            </Menu>
          </div>
        </div>
      </div>
      <div className="allws-scroll">
        <div className="allws-list" role="listbox" aria-label="Workspaces">
          {groups.length > 0 ? (
            <>
              {groups.map((g) => (
                <section key={g.bucket} className="allws-group" aria-label={g.label}>
                  <h2 className="allws-group-heading">
                    {g.label} <span className="allws-count">{g.rows.length}</span>
                  </h2>
                  {g.rows.map((row) => {
                    index += 1;
                    const i = index;
                    return (
                      <Row
                        key={row.workspace.id}
                        row={row}
                        showRepoIcon={filters.projects.length === 0}
                        active={i === activeIndex}
                        now={now}
                        onOpen={() => open(row)}
                      />
                    );
                  })}
                </section>
              ))}
              {hasMore && <div ref={sentinel} className="allws-more" role="status" aria-label="Loading more workspaces" />}
            </>
          ) : (
            <div className="allws-empty">
              <span>No matching workspaces</span>
              {empty === "create" && (
                <button type="button" className="allws-create" onClick={onCreateWorkspace}>
                  Create a workspace
                </button>
              )}
              {empty === "clear" && (
                <button type="button" className="allws-clear" onClick={() => setFilters(CLEARED_FILTERS)}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
