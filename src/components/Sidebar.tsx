import { useEffect, useRef, useState, type Dispatch } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ArrowLeftIcon, ArrowRightIcon, BranchIcon, ChevronDownIcon, ChevronIcon, HomeIcon, MoreIcon, PlusIcon, SearchIcon, SidebarIcon } from "./Icons";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";
import { byRecentActivity, workspaceLabel } from "./sidebarLabel";

/** Default shortcut glyphs for a registered command, e.g. "⌘N" for workspace.create. */
function hint(commandId: string): string {
  const c = COMMANDS.find((cmd) => cmd.id === commandId);
  return c ? glyphs(c.key) : "";
}

export interface NavControls {
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

const STATUS_LABEL: Record<Workspace["status"], string> = {
  idle: "Idle",
  working: "Working",
  "needs-review": "Ready for review",
  archived: "Archived",
};

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onOpenDialog: (d: DialogKind, repoId?: string) => void;
  onOpenProject: () => void;
  onOpenSettings: () => void;
  onSearch: () => void;
  nav: NavControls;
  info: AppInfo | null;
  /** Local computer label; Conductor shows "<name>'s Mac", or "My Mac" with no user name. */
  computerName?: string;
}

function NavRow({ icon, label, shortcut, active, onClick }: { icon: JSX.Element; label: string; shortcut: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sb-row" data-active={active ? "true" : undefined} title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick}>
      <span className="sb-row-icon">{icon}</span>
      <span className="sb-row-label">{label}</span>
      {shortcut && <kbd className="sb-row-hint">{shortcut}</kbd>}
    </button>
  );
}

interface MenuItem { label: string; onSelect: () => void }

/** Hover "..." trigger and its menu on a section or repo header (Conductor's `Aet`). */
function HeaderMenu({ label, items, className }: { label: string; items: MenuItem[]; className: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className={`sb-menu-anchor ${className}`} data-open={open || undefined}>
      <button type="button" className="sb-menu-trigger" aria-label={`${label} actions`} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <MoreIcon size={14} />
      </button>
      {open && (
        <div className="sb-menu" role="menu">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="sb-menu-item" onClick={() => { setOpen(false); item.onSelect(); }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, onOpenSettings, onSearch, nav, info, computerName = "My Mac" }: Props) {
  const sel = state.selection;
  // Conductor persists this per collapse key; ours lasts for the session.
  const [groupCollapsed, setGroupCollapsed] = useState(false);
  return (
    <aside className="sidebar" aria-label="Repositories and workspaces">
      {/* Top bar: drag region with the sidebar toggle, back/forward at the top right. */}
      <div className="sb-header">
        <div className="sb-topbar" data-tauri-drag-region>
          <button
            type="button"
            className="sb-toggle"
            aria-label="Toggle left sidebar"
            title={`Toggle left sidebar (${hint("view.toggleLeftSidebar")})`}
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        </div>
        <div className="sb-history">
          <button type="button" className="sb-icon-btn" aria-label="Go back" title={`Go back (${hint("nav.back")})`} disabled={!nav.canBack} onClick={nav.onBack}>
            <ArrowLeftIcon size={12} />
          </button>
          <button type="button" className="sb-icon-btn" aria-label="Go forward" title={`Go forward (${hint("nav.forward")})`} disabled={!nav.canForward} onClick={nav.onForward}>
            <ArrowRightIcon size={12} />
          </button>
        </div>

        <div className="sb-primary">
          {/* Computer switcher. Only the local computer exists for now, so the menu is not built yet. */}
          <div className="sb-row sb-computer" title={computerName}>
            <span className="sb-row-icon">
              <span className="sb-avatar" aria-hidden>{computerName.charAt(0).toUpperCase()}</span>
            </span>
            <span className="sb-computer-name">{computerName}</span>
            <ChevronDownIcon size={12} />
          </div>
          <NavRow icon={<HomeIcon size={12} />} label="Home" shortcut={hint("nav.home")} onClick={() => dispatch({ type: "select", selection: { kind: "home" } })} />
          <NavRow icon={<PlusIcon size={12} />} label="Create" shortcut={hint("workspace.create")} onClick={() => onOpenDialog("create")} />
          <NavRow icon={<SearchIcon size={12} />} label="Search" shortcut={hint("toggleCommandPalette")} onClick={onSearch} />
        </div>
      </div>

      <nav className="repo-list">
        {/* "My workspaces" section header (Conductor's `lBi`): label, hover chevron, "..." menu with Add project. */}
        <div className="sb-section-header">
          <button type="button" className="sb-section-toggle" aria-expanded={!groupCollapsed} onClick={() => setGroupCollapsed(!groupCollapsed)}>
            <span className="sb-section-label">My workspaces</span>
            <span className="sb-section-spacer" aria-hidden />
            <span className="sb-section-chevron" data-collapsed={groupCollapsed || undefined}>
              {groupCollapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}
            </span>
          </button>
          <HeaderMenu label="My workspaces" className="sb-section-menu" items={[{ label: "Add project…", onSelect: onOpenProject }]} />
        </div>
        {!groupCollapsed && state.repos.length === 0 && <p className="sidebar-empty">Add a project to get started.</p>}
        {!groupCollapsed && (
          <div className="sb-repo-groups">
            {state.repos.map((repo) => (
          <div key={repo.id} className="sb-repo-group">
            <div className="sb-repo">
              <div
                className="sb-repo-header"
                role="button"
                tabIndex={0}
                aria-expanded={!repo.collapsed}
                onClick={() => dispatch({ type: "toggleRepo", repoId: repo.id })}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  dispatch({ type: "toggleRepo", repoId: repo.id });
                }}
              >
                <div className="sb-repo-main">
                  <span className="sb-repo-lead">
                    <span className="sb-repo-initial" aria-hidden>{repo.name.charAt(0).toUpperCase()}</span>
                    <span className="sb-repo-chevron" aria-hidden>{repo.collapsed ? <ChevronIcon size={12} /> : <ChevronDownIcon size={12} />}</span>
                  </span>
                  <span className="sb-repo-name">{repo.name}</span>
                  {repo.collapsed && repo.workspaces.length > 0 && <span className="sb-repo-count">{repo.workspaces.length}</span>}
                </div>
                <span className="sb-repo-spacer" aria-hidden />
                <button
                  type="button"
                  className="sb-repo-add"
                  title="Create workspace"
                  aria-label={`Create workspace in ${repo.name}`}
                  onClick={(e) => { e.stopPropagation(); onOpenDialog("create", repo.id); }}
                >
                  <PlusIcon size={16} />
                </button>
              </div>
              <HeaderMenu label={repo.name} className="sb-repo-menu" items={[{ label: "New workspace", onSelect: () => onOpenDialog("create", repo.id) }]} />
            </div>
            {!repo.collapsed && (
              <div className="sb-ws-list">
                {repo.workspaces.length === 0 && <p className="ws-empty">No workspaces</p>}
                {byRecentActivity(repo.workspaces).map((ws) => {
                  const active = sel.kind === "workspace" && sel.workspaceId === ws.id;
                  const label = workspaceLabel({ name: ws.name, branch: ws.branch, prTitle: ws.prTitle, userSetWorkspaceName: ws.userSetWorkspaceName, targetBranch: repo.defaultBranch });
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      className="sb-ws"
                      data-testid="left-sidebar-workspace-item"
                      data-active={active || undefined}
                      data-unread={ws.unread || undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={() => dispatch({ type: "select", selection: { kind: "workspace", repoId: repo.id, workspaceId: ws.id } })}
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
                })}
              </div>
            )}
          </div>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <span>{info ? `${info.name} ${info.version} · ${info.platform}` : "OpenConductor"}</span>
        <button className="btn btn-small" title="Settings (⌘,)" onClick={onOpenSettings}>
          Settings
        </button>
      </div>
    </aside>
  );
}
