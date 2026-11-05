import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type MutableRefObject } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon, SendIcon } from "./Icons";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "../features/chat/reducer.ts";
import type { ChatMessage } from "../features/chat/types.ts";
import { Transcript } from "../features/chat/Transcript.tsx";
import { DiffViewer } from "../features/diff/DiffViewer";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { ScriptsPanel } from "./ScriptsPanel";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
}

// Chat transcripts are kept per workspace in memory until the agent runtime lands.
const transcripts = new Map<string, ChatTranscript>();

function textMessage(workspaceId: string, role: ChatMessage["role"], text: string): ChatMessage {
  const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { id, sessionId: workspaceId, turnId: id, role, createdAt: new Date().toISOString(), blocks: [{ type: "text", text }] };
}

function withMessages(t: ChatTranscript, messages: ChatMessage[]): ChatTranscript {
  const r = applyChatEvents(t, messages.map((message) => ({ type: "upsert", message })));
  return r.ok ? r.transcript : t;
}

/** Puts the Create-workspace dialog's first message at the top of the new workspace's chat. */
export function seedTranscript(workspaceId: string, text: string) {
  transcripts.set(workspaceId, withMessages(emptyTranscript(workspaceId), [textMessage(workspaceId, "user", text)]));
}

function ChatPanel({ repo, workspace, dispatch, bridge }: Props & { bridge: MutableRefObject<ChatBridge | null> }) {
  const load = () => transcripts.get(workspace.id) ?? emptyTranscript(workspace.id);
  const [transcript, setTranscript] = useState<ChatTranscript>(load);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTranscript(load());
    setDraft("");
  }, [workspace.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  function sendText(text: string) {
    const first = !transcript.messages.some((m) => m.role === "user");
    const next = withMessages(transcript, [
      textMessage(workspace.id, "user", text),
      textMessage(workspace.id, "system", "No agent is connected yet. The agent runtime is a later milestone; this message stays in this workspace's local transcript."),
    ]);
    transcripts.set(workspace.id, next);
    setTranscript(next);
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  // The diff viewer adds review comments to the composer and sends Review prompts.
  bridge.current = {
    insert: (text) => {
      setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${text}` : text));
      inputRef.current?.focus();
    },
    send: sendText,
  };

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendText(text);
    setDraft("");
  }

  return (
    <section className="chat" aria-label="Chat">
      <div className="chat-scroll">
        {transcript.messages.length === 0 ? (
          <div className="placeholder">
            <h3>Chat with the agent</h3>
            <p>
              Messages you send here will run an agent inside <code>{workspace.name}</code>'s worktree on branch <code>{workspace.branch}</code>.
            </p>
            <p className="muted">Placeholder: agent sessions are not wired up yet.</p>
          </div>
        ) : (
          <Transcript transcript={transcript} onRetry={(prompt) => sendText(prompt)} />
        )}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={send}>
        <textarea
          ref={inputRef}
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

function DiffPanel({ workspace, repo, bridge }: { workspace: Workspace; repo: Repo; bridge: MutableRefObject<ChatBridge | null> }) {
  const [tab, setTab] = useState<"changes" | "files">("changes");
  const chat = useMemo<ChatBridge>(() => ({ insert: (t) => bridge.current?.insert(t), send: (t) => bridge.current?.send(t) }), [bridge]);
  const review = useReviewComments(workspace.id, chat);
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
      {tab === "changes" ? (
        <DiffViewer workspaceId={workspace.id} worktree={workspace.path ?? null} baseBranch={repo.defaultBranch} {...review} />
      ) : (
        <div className="diff-body">
          <div className="placeholder small">
            <p>File tree of the worktree will appear here.</p>
          </div>
        </div>
      )}
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
  const [showTerminal, setShowTerminal] = useState(true);
  const chatBridge = useRef<ChatBridge | null>(null);
  const settingUp = useCreateSetupRunning(workspace.id);
  useKeybindings({ "view.toggleTerminalPanel": () => setShowTerminal((v) => !v) });
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
          {settingUp && (
            <span className="chip status setting-up" role="status">
              <span className="status-dot working" /> {RUNNING_SETUP}
            </span>
          )}
        </div>
        <div className="ws-actions">
          <button className="btn btn-small" title="Toggle terminal panel" aria-pressed={showTerminal} onClick={() => setShowTerminal((v) => !v)}>
            Terminal
          </button>
          <button className="btn btn-small" title="Archive workspace" onClick={() => dispatch({ type: "archiveWorkspace", repoId: repo.id, workspaceId: workspace.id })}>
            <ArchiveIcon size={14} /> Archive
          </button>
        </div>
      </header>
      <div className="ws-split">
        <ChatPanel repo={repo} workspace={workspace} dispatch={dispatch} bridge={chatBridge} />
        <div className="ws-right">
          <DiffPanel workspace={workspace} repo={repo} bridge={chatBridge} />
          <ScriptsPanel repo={repo} workspace={workspace} />
        </div>
      </div>
      {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
      {showTerminal && <TerminalPanel workspaceId={workspace.id} cwd={repo.path} />}
    </div>
  );
}
