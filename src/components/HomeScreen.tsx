import type { Dispatch, ReactNode } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import type { DialogKind } from "./Dialogs";
import { CloudIcon, FolderIcon, LogoMark, SparkIcon } from "./Icons";

interface Props {
  repos: Repo[];
  dispatch: Dispatch<Action>;
  onOpenDialog: (d: DialogKind) => void;
}

function Entry({ icon, title, body, onClick, hint }: { icon: ReactNode; title: string; body: string; onClick: () => void; hint?: string }) {
  return (
    <button className="home-entry" onClick={onClick}>
      <span className="home-entry-icon">{icon}</span>
      <span className="home-entry-text">
        <span className="home-entry-title">{title}</span>
        <span className="home-entry-body">{body}</span>
      </span>
      {hint && <kbd className="home-entry-hint">{hint}</kbd>}
    </button>
  );
}

export function HomeScreen({ repos, dispatch, onOpenDialog }: Props) {
  return (
    <div className="home">
      <div className="titlebar-spacer" data-tauri-drag-region />
      <div className="home-inner">
        <div className="home-hero">
          <LogoMark size={44} />
          <h1>OpenConductor</h1>
          <p>Run coding agents side by side, each in its own git worktree.</p>
        </div>

        <div className="home-entries">
          <Entry icon={<FolderIcon size={20} />} title="Open project" body="Add a git repository from this computer." onClick={() => onOpenDialog("open")} />
          <Entry icon={<CloudIcon size={20} />} title="Open GitHub project" body="Clone a repository from GitHub by URL or owner/name." onClick={() => onOpenDialog("clone")} />
          <Entry icon={<SparkIcon size={20} />} title="Quick start" body="Create a fresh repository from a starter template." onClick={() => onOpenDialog("quickstart")} />
        </div>

        {repos.length > 0 && (
          <section className="home-recent">
            <h2>Repositories</h2>
            <ul>
              {repos.map((r) => (
                <li key={r.id}>
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-path">{r.remote ?? r.path}</span>
                  <span className="recent-count">{r.workspaces.length} workspace{r.workspaces.length === 1 ? "" : "s"}</span>
                  <button className="btn btn-small" onClick={() => dispatch({ type: "newWorkspace", repoId: r.id })}>New workspace</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
