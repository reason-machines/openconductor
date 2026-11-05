import type { Dispatch } from "react";
import type { AppState, Workspace } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import type { AppInfo } from "../backend";
import { ChevronIcon, HomeIcon, LogoMark, PlusIcon } from "./Icons";

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
  info: AppInfo | null;
}

export function Sidebar({ state, dispatch, onOpenDialog, onOpenProject, info }: Props) {
  const sel = state.selection;
  return (
    <aside className="sidebar" aria-label="Repositories and workspaces">
      <div className="sidebar-drag" data-tauri-drag-region />
      <div className="sidebar-brand">
        <LogoMark />
        <span>OpenConductor</span>
      </div>

      <button className={`nav-item ${sel.kind === "home" ? "active" : ""}`} onClick={() => dispatch({ type: "select", selection: { kind: "home" } })}>
        <HomeIcon size={15} />
        <span>Home</span>
      </button>
      <button className="nav-item" onClick={() => onOpenDialog("create")} title="New workspace (⌘N)">
        <PlusIcon size={15} />
        <span>New workspace</span>
      </button>

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
        {info ? `${info.name} ${info.version} · ${info.platform}` : "OpenConductor"}
      </div>
    </aside>
  );
}
