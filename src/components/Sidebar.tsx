import type { Dispatch } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, ChevronIcon, HomeIcon, PlusIcon, SearchIcon, SidebarIcon } from "./Icons";
import { COMMANDS } from "../keybindings/registry";
import { glyphs } from "../keybindings/shortcut";

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

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, onOpenSettings, onSearch, nav, info, computerName = "My Mac" }: Props) {
  const sel = state.selection;
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

      <div className="sidebar-section-header">
        <span>Repositories</span>
        <button className="icon-btn" title="Add repository" aria-label="Add repository" onClick={onOpenProject}>
          <PlusIcon size={14} />
        </button>
      </div>

      <nav className="repo-list">
        {state.repos.length === 0 && <p className="sidebar-empty">Add a project to get started.</p>}
        {state.repos.map((repo) => (
          <div key={repo.id} className="repo">
            <div className="repo-row">
              <button className="repo-toggle" onClick={() => dispatch({ type: "toggleRepo", repoId: repo.id })} aria-expanded={!repo.collapsed}>
                <ChevronIcon size={12} open={!repo.collapsed} />
                <span className="repo-name">{repo.name}</span>
              </button>
              <button className="icon-btn repo-add" title={`New workspace in ${repo.name}`} aria-label={`New workspace in ${repo.name}`} onClick={() => onOpenDialog("create", repo.id)}>
                <PlusIcon size={13} />
              </button>
            </div>
            {!repo.collapsed && (
              <ul className="ws-list">
                {repo.workspaces.length === 0 && <li className="ws-empty">No workspaces</li>}
                {repo.workspaces.map((ws) => {
                  const active = sel.kind === "workspace" && sel.workspaceId === ws.id;
                  return (
                    <li key={ws.id}>
                      <button
                        className={`ws-item ${active ? "active" : ""}`}
                        onClick={() => dispatch({ type: "select", selection: { kind: "workspace", repoId: repo.id, workspaceId: ws.id } })}
                        title={`${ws.branch} · ${STATUS_LABEL[ws.status]}`}
                      >
                        <span className={`status-dot ${ws.status}`} aria-label={STATUS_LABEL[ws.status]} />
                        <span className="ws-name">{ws.name}</span>
                        {(ws.diff.added > 0 || ws.diff.removed > 0) && (
                          <span className="ws-diff">
                            <span className="add">+{ws.diff.added}</span> <span className="del">-{ws.diff.removed}</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
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
