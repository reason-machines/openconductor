import { useEffect, useRef, useState, type Dispatch, type FormEvent } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon, FileIcon, SendIcon } from "./Icons";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
}

interface Message {
  id: number;
  role: "user" | "system";
  text: string;
}

// Chat transcripts are kept per workspace in memory until the agent runtime lands.
const transcripts = new Map<string, Message[]>();

/** Puts the Create-workspace dialog's first message at the top of the new workspace's chat. */
export function seedTranscript(workspaceId: string, text: string) {
  transcripts.set(workspaceId, [{ id: Date.now(), role: "user", text }]);
}

function ChatPanel({ workspace }: { workspace: Workspace }) {
  const [messages, setMessages] = useState<Message[]>(() => transcripts.get(workspace.id) ?? []);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(transcripts.get(workspace.id) ?? []);
    setDraft("");
  }, [workspace.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const next: Message[] = [
      ...messages,
      { id: Date.now(), role: "user", text },
      { id: Date.now() + 1, role: "system", text: "No agent is connected yet. The agent runtime is a later milestone; this message stays in this workspace's local transcript." },
    ];
    transcripts.set(workspace.id, next);
    setMessages(next);
    setDraft("");
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="placeholder">
            <h3>Chat with the agent</h3>
            <p>
              Messages you send here will run an agent inside <code>{workspace.name}</code>'s worktree on branch <code>{workspace.branch}</code>.
            </p>
            <p className="muted">Placeholder: agent sessions are not wired up yet.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`msg msg-${m.role}`}>
              {m.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={send}>
        <textarea
          value={draft}
          placeholder={`Ask the agent to work in ${workspace.name}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send(e);
          }}
          rows={3}
        />
        <div className="composer-bar">
          <span className="muted">Enter to send, Shift+Enter for a new line</span>
          <button className="btn btn-primary btn-small" type="submit" disabled={!draft.trim()}>
            <SendIcon size={14} /> Send
          </button>
        </div>
      </form>
    </section>
  );
}

function DiffPanel({ workspace, repo }: { workspace: Workspace; repo: Repo }) {
  const [tab, setTab] = useState<"changes" | "files">("changes");
  const hasChanges = workspace.diff.added + workspace.diff.removed > 0;
  return (
    <section className="diff" aria-label="Changes">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          Changes
        </button>
        <button role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          Files
        </button>
      </div>
      <div className="diff-body">
        {tab === "changes" ? (
          <>
            <div className="diff-summary">
              <span>
                vs <code>{repo.defaultBranch}</code>
              </span>
              <span className="add">+{workspace.diff.added}</span>
              <span className="del">-{workspace.diff.removed}</span>
            </div>
            <div className="placeholder small">
              <FileIcon size={22} />
              <p>{hasChanges ? "Diff viewer placeholder: file-by-file diffs will render here." : "No changes in this workspace yet."}</p>
              <p className="muted">Diff loading comes from the workspace backend (not wired up yet).</p>
            </div>
          </>
        ) : (
          <div className="placeholder small">
            <p>File tree of the worktree will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<Workspace["status"], string> = {
  idle: "Idle",
  working: "Working",
  "needs-review": "Ready for review",
  archived: "Archived",
};

export function WorkspaceView({ repo, workspace, dispatch }: Props) {
  return (
    <div className="workspace">
      <header className="ws-header" data-tauri-drag-region>
        <div className="ws-title">
          <span className="crumb">{repo.name}</span>
          <span className="crumb-sep">/</span>
          <strong>{workspace.name}</strong>
          <span className="chip">
            <BranchIcon size={12} /> {workspace.branch}
          </span>
          <span className={`chip status ${workspace.status}`}>
            <span className={`status-dot ${workspace.status}`} /> {STATUS_TEXT[workspace.status]}
          </span>
        </div>
        <div className="ws-actions">
          <button className="btn btn-small" title="Archive workspace" onClick={() => dispatch({ type: "archiveWorkspace", repoId: repo.id, workspaceId: workspace.id })}>
            <ArchiveIcon size={14} /> Archive
          </button>
        </div>
      </header>
      <div className="ws-split">
        <ChatPanel workspace={workspace} />
        <DiffPanel workspace={workspace} repo={repo} />
      </div>
    </div>
  );
}
