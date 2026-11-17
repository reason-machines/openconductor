import type { Repo, Workspace } from "../state/types";
import { agoTime } from "../home/dashboard";
import { MoreIcon } from "./Icons";
import { PencilIcon } from "./menu/menuIcons";
import type { MouseEvent } from "react";

interface Props {
  workspace: Pick<Workspace, "name" | "createdAt">;
  repo?: Pick<Repo, "name">;
  onRename: () => void;
  onActions: (event: MouseEvent<HTMLButtonElement>) => void;
}

function createdAge(at: number): string {
  if (!at) return "";
  if (!Number.isFinite(new Date(at).getTime())) return "Invalid time";
  return agoTime(at);
}

export function WorkspaceDetails({ workspace, repo, onRename, onActions }: Props) {
  return (
    <div className="ws-details-content">
      <div className="ws-details-heading">
        <span className="ws-details-name">{workspace.name}</span>
        <button type="button" className="ws-details-action" aria-label="Rename workspace" title="Rename" onClick={onRename}><PencilIcon /></button>
        <button type="button" className="ws-details-action" aria-label="Workspace actions" title="Workspace actions" onClick={onActions}><MoreIcon size={14} /></button>
      </div>
      <dl className="ws-details-fields">
        {repo && <div><dt><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 19a5 5 0 0 1-5-5v8" /><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5" /><circle cx="13" cy="12" r="2" /><circle cx="20" cy="19" r="2" /></svg>Repository</dt><dd>{repo.name}</dd></div>}
        {workspace.createdAt !== undefined && <div><dt><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="10" /></svg>Created</dt><dd>{createdAge(workspace.createdAt)}</dd></div>}
      </dl>
    </div>
  );
}
