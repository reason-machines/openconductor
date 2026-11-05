// parity:sidebar.archived-view:ui
// An archived workspace opened from the archived list (Conductor 0.87.6,
// renderApp: the workspace menu's "Unarchive" in place of "Archive", the chat
// banner `iIo` "This workspace is archived." with "Unarchive" /
// "Unarchiving...", and `Nji`'s "Workspace archived" placeholder for the file,
// terminal and browser tabs). The transcript stays readable: it comes from
// conductor.db through the chat store, with no composer.
import { useEffect, useState, type Dispatch } from "react";
import { ArchiveIcon, BranchIcon } from "./Icons";
import { Transcript } from "../features/chat/Transcript";
import { chatSnapshot, subscribeChat } from "../features/chat/reasonChat";
import type { ChatSnapshot } from "../features/chat/chatRuntime";
import type { Action } from "../state/store";
import type { Repo, Workspace } from "../state/types";
import { ARCHIVED_BANNER, onArchiveEvent } from "../workspace/archive";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
}

export function ArchivedWorkspaceView({ repo, workspace, dispatch }: Props) {
  const [{ transcript }, setSnapshot] = useState<ChatSnapshot>(() => chatSnapshot(workspace.id));
  useEffect(() => {
    setSnapshot(chatSnapshot(workspace.id));
    return subscribeChat(workspace.id, setSnapshot);
  }, [workspace.id]);
  const [pending, setPending] = useState(false);
  useEffect(
    () =>
      onArchiveEvent<Action>((e) => {
        if ((e.type === "unarchived" || e.type === "unarchive-failed") && e.action.type === "unarchiveWorkspace" && e.action.workspaceId === workspace.id) setPending(false);
      }),
    [workspace.id],
  );
  const unarchive = () => {
    setPending(true);
    dispatch({ type: "unarchiveWorkspace", repoId: repo.id, workspaceId: workspace.id });
  };
  const label = pending ? ARCHIVED_BANNER.unarchiving : ARCHIVED_BANNER.unarchive;
  return (
    <div className="workspace archived-workspace" data-archived>
      <header className="ws-header" data-tauri-drag-region>
        <div className="ws-title">
          <span className="crumb">{repo.name}</span>
          <span className="crumb-sep">/</span>
          <strong>{workspace.name}</strong>
          <span className="chip">
            <BranchIcon size={12} /> {workspace.branch}
          </span>
          <span className="chip status archived">
            <span className="status-dot archived" /> Archived
          </span>
        </div>
        <div className="ws-actions">
          <button className="btn btn-small" title="Unarchive workspace" disabled={pending} onClick={unarchive}>
            <ArchiveIcon size={14} /> {ARCHIVED_BANNER.unarchive}
          </button>
        </div>
      </header>
      <div className="ws-split">
        <section className="chat" aria-label="Chat">
          <div className="chat-scroll">
            {transcript.messages.length === 0 ? (
              <div className="placeholder">
                <p className="muted">No messages in this workspace.</p>
              </div>
            ) : (
              <Transcript transcript={transcript} />
            )}
          </div>
          <div className="archived-banner" role="status">
            <span className="archived-banner-text">
              <ArchiveIcon size={16} /> {ARCHIVED_BANNER.text}
            </span>
            <button type="button" className="btn btn-small" onClick={unarchive} disabled={pending}>
              {label}
            </button>
          </div>
        </section>
        <div className="ws-right archived-placeholder">
          <div className="placeholder small">
            <ArchiveIcon size={20} />
            <h3>{ARCHIVED_BANNER.placeholderTitle}</h3>
            <p>{ARCHIVED_BANNER.placeholderText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
