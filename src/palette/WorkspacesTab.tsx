// The command palette's Workspaces tab: compact filter bar, rows and empty
// state, after Conductor 0.87.6's `l_a`, `nFi` (compact) and `SUi` (row). The
// row model is src/palette/workspacesTab.ts.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Repo } from "../state/types.ts";
import { ARCHIVE_FILTERS, ARCHIVE_FILTER_LABELS, reposWithWorkspaces, shortRelativeTime, showProjectFilter, toggleProject, type HomeFilters, type HomeRow } from "../home/allWorkspaces.ts";
import { isWorkspaceUnread } from "../state/chatUnread.ts";
import { useWorkspaceAgentStatus } from "../features/chat/useWorkspaceSession.ts";
import { homeStatus, rowStatusLabel, showsActivityStatus } from "../state/rowStatus.ts";
import { RowStatusIcon } from "../components/RowStatusIcon";
import { workspaceNumberLabel } from "../state/workspaceNumber.ts";
import { ARCHIVE_FILTER_LABEL } from "../workspace/archivedList.ts";
import { ArchiveIcon, CheckIcon, ChevronDownIcon, FolderIcon } from "../components/Icons";
import { compactProjectLabel } from "./workspacesTab.ts";

/** A filter trigger and its popup; closes on outside press or Escape. */
function FilterMenu({ label, icon, ariaLabel, popup, align, children }: { label: string; icon: ReactNode; ariaLabel?: string; popup: "menu" | "listbox"; align: "start" | "end"; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes the popup, not the palette.
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);
  return (
    <div className="palette-ws-filter-wrap" ref={ref}>
      <button
        type="button"
        className="palette-ws-filter"
        aria-label={ariaLabel}
        aria-haspopup={popup}
        aria-expanded={open}
        data-open={open || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span className="palette-ws-filter-label">{label}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="palette-ws-filter-pop" data-align={align} role={popup} aria-label={ariaLabel ?? label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** The project menu's checkbox (Conductor's `i4e`: a 14px box, filled with a check when on). */
function Checkbox({ on }: { on: boolean }) {
  return (
    <span className="palette-ws-checkbox" data-checked={on || undefined} aria-hidden>
      {on && <CheckIcon size={12} />}
    </span>
  );
}

export function WorkspaceFilters({ repos, filters, onChange }: { repos: readonly Repo[]; filters: HomeFilters; onChange: (f: HomeFilters) => void }) {
  const choices = reposWithWorkspaces(repos as Repo[]);
  return (
    <div className="palette-ws-filters">
      {showProjectFilter(repos as Repo[]) && (
        <FilterMenu popup="menu" align="start" label={compactProjectLabel(repos, filters.projects)} icon={<FolderIcon size={14} />}>
          {() => (
            <>
              <button type="button" role="menuitemcheckbox" aria-checked={filters.projects.length === 0} className="palette-ws-filter-item" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ ...filters, projects: [] })}>
                <Checkbox on={filters.projects.length === 0} />
                <span className="palette-ws-filter-text">All projects</span>
              </button>
              {choices.map((r) => {
                const on = filters.projects.includes(r.id);
                return (
                  <button key={r.id} type="button" role="menuitemcheckbox" aria-checked={on} className="palette-ws-filter-item" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange({ ...filters, projects: toggleProject(filters.projects, r.id) })}>
                    <Checkbox on={on} />
                    <span className="allws-repo-initial" aria-hidden>{r.name.charAt(0).toUpperCase()}</span>
                    <span className="palette-ws-filter-text">{r.name}</span>
                  </button>
                );
              })}
            </>
          )}
        </FilterMenu>
      )}
      <FilterMenu popup="listbox" align="end" ariaLabel={ARCHIVE_FILTER_LABEL} label={ARCHIVE_FILTER_LABELS[filters.archiveFilter]} icon={<ArchiveIcon size={14} />}>
        {(close) =>
          ARCHIVE_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="option"
              aria-selected={filters.archiveFilter === f}
              data-value={f}
              className="palette-ws-filter-item palette-ws-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ ...filters, archiveFilter: f });
                close();
              }}
            >
              {/* Conductor's Select item: the label, then the tick at the right edge. */}
              <span className="palette-ws-filter-text">{ARCHIVE_FILTER_LABELS[f]}</span>
              {filters.archiveFilter === f && (
                <span className="palette-ws-tick" aria-hidden>
                  <CheckIcon size={16} />
                </span>
              )}
            </button>
          ))
        }
      </FilterMenu>
    </div>
  );
}

/** One row (Conductor's `SUi`): repo initial, optional W-<n>, display name, then the time or the agent's status. */
export function WorkspaceRow({ row, active, showNumber, now, onHover, onChoose }: { row: HomeRow; active: boolean; showNumber: boolean; now: number; onHover: () => void; onChoose: () => void }) {
  const { workspace: ws, repo, archived } = row;
  const status = homeStatus(ws.state, useWorkspaceAgentStatus(ws));
  const tone = archived ? "is-archived" : isWorkspaceUnread(ws) ? "is-unread" : "";
  return (
    <div
      role="option"
      aria-selected={active}
      data-archived={archived || undefined}
      className={active ? "palette-item palette-ws-row active" : "palette-item palette-ws-row"}
      title={row.title}
      onMouseMove={() => !active && onHover()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
    >
      <span className="allws-repo-initial palette-ws-repo" title={repo.name} aria-hidden>
        {repo.name.charAt(0).toUpperCase()}
      </span>
      <span className="palette-ws-main">
        {showNumber && <span className={`palette-number${archived ? " is-archived" : ""}`}>{workspaceNumberLabel(ws.number) ?? ""}</span>}
        <span className={`palette-title ${tone}`}>{row.title}</span>
      </span>
      <span className="palette-ws-trail">
        {archived || !showsActivityStatus(status) ? (
          <span className={`palette-ws-time${archived ? " is-archived" : ""}`}>{shortRelativeTime(row.lastActiveAt, now)}</span>
        ) : (
          <span className="palette-ws-status" data-status={status} role="img" title={rowStatusLabel(status)} aria-label={rowStatusLabel(status)}>
            <RowStatusIcon status={status} />
          </span>
        )}
      </span>
    </div>
  );
}
