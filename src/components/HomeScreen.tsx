import type { Dispatch, ReactNode } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import { FolderIcon, FolderPlusIcon, GlobeIcon, SidebarIcon } from "./Icons";
import { Wordmark } from "./Wordmark";
import { activeWorkspaceCount } from "../state/selectors";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs } from "../keybindings/shortcut";
import { PassportButton } from "../home/PassportDialog";
import { Tooltip } from "./Tooltip";

// Layout follows evidence/screens/home.md (Conductor's `Gls`): wordmark, three entry
// cards, the "cities visited" line, and a sidebar toggle only while the sidebar is
// hidden. The repository list lives in the sidebar.

interface Props {
  repos: Repo[];
  sidebarVisible: boolean;
  dispatch: Dispatch<Action>;
  onOpenDialog: (d: DialogKind, repoId?: string) => void;
  onOpenProject: () => void;
}

function EntryCard({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className="home-card" onClick={onClick}>
      <span className="home-card-icon">{icon}</span>
      <span className="home-card-label">{label}</span>
    </button>
  );
}

export function HomeScreen({ repos, sidebarVisible, dispatch, onOpenDialog, onOpenProject }: Props) {
  const { overrides } = useKeybindingOverrides();
  const sidebarHint = effectiveShortcuts("view.toggleLeftSidebar", overrides).map(glyphs).join(" or ");
  const hasWorkspaces = activeWorkspaceCount(repos) > 0;
  return (
    <div className="home" data-tauri-drag-region>
      {!sidebarVisible && (
        <Tooltip content="Toggle left sidebar" shortcut={sidebarHint}>
          <button
            type="button"
            className="home-sidebar-toggle"
            aria-label="Toggle left sidebar"
            onClick={() => dispatch({ type: "toggleSidebar" })}
          >
            <SidebarIcon size={16} />
          </button>
        </Tooltip>
      )}
      <div className="home-wordmark">
        <Wordmark />
      </div>
      <div className={`home-cards-wrap ${hasWorkspaces ? "has-workspaces" : ""}`}>
        <div className="home-cards">
          <EntryCard icon={<FolderIcon size={16} strokeWidth={1} />} label="Open project" onClick={onOpenProject} />
          <EntryCard icon={<GlobeIcon size={16} strokeWidth={1} />} label="Open GitHub project" onClick={() => onOpenDialog("clone")} />
          <EntryCard icon={<FolderPlusIcon size={16} strokeWidth={1} />} label="Quick start" onClick={() => onOpenDialog("quickstart")} />
        </div>
      </div>
      <div className="home-footer"><PassportButton repos={repos} dispatch={dispatch} /></div>
    </div>
  );
}
