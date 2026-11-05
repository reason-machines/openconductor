import type { Dispatch, ReactNode } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import { CloudIcon, FolderIcon, SidebarIcon, SparkIcon } from "./Icons";
import { Wordmark } from "./Wordmark";

// Layout follows evidence/screens/home.md: wordmark, three entry cards, and a sidebar
// toggle only while the sidebar is hidden. The repository list lives in the sidebar.

interface Props {
  repos: Repo[];
  sidebarVisible: boolean;
  dispatch: Dispatch<Action>;
  onOpenDialog: (d: DialogKind) => void;
}

function EntryCard({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="home-card" onClick={onClick}>
      <span className="home-card-icon">{icon}</span>
      <span className="home-card-label">{label}</span>
    </button>
  );
}

/** Workspaces that are not archived, across all repositories. */
export function activeWorkspaceCount(repos: Repo[]): number {
  return repos.reduce((n, r) => n + r.workspaces.filter((w) => w.status !== "archived").length, 0);
}

export function HomeScreen({ repos, sidebarVisible, dispatch, onOpenDialog }: Props) {
  const hasWorkspaces = activeWorkspaceCount(repos) > 0;
  return (
    <div className="home" data-tauri-drag-region>
      {!sidebarVisible && (
        <button
          type="button"
          className="home-sidebar-toggle"
          title="Toggle left sidebar"
          aria-label="Toggle left sidebar"
          onClick={() => dispatch({ type: "toggleSidebar" })}
        >
          <SidebarIcon size={16} />
        </button>
      )}
      <div className="home-wordmark">
        <Wordmark />
      </div>
      <div className={`home-cards-wrap ${hasWorkspaces ? "has-workspaces" : ""}`}>
        <div className="home-cards">
          <EntryCard icon={<FolderIcon size={16} />} label="Open project" onClick={() => onOpenDialog("open")} />
          <EntryCard icon={<CloudIcon size={16} />} label="Open GitHub project" onClick={() => onOpenDialog("clone")} />
          <EntryCard icon={<SparkIcon size={16} />} label="Quick start" onClick={() => onOpenDialog("quickstart")} />
        </div>
      </div>
    </div>
  );
}
