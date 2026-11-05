import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon, SendIcon } from "./Icons";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "../features/chat/reducer.ts";
import type { ChatMessage } from "../features/chat/types.ts";
import { Transcript } from "../features/chat/Transcript.tsx";
import { reasonAvailable, reasonTranscript, resetReasonChat, sendReason, stopReason, subscribeReason } from "../features/chat/reasonChat.ts";
import { ResetChatDialog } from "../features/chat/ResetChatDialog.tsx";
import { changedSinceTurn } from "../features/chat/checkpoints.ts";
import { invoke } from "@tauri-apps/api/core";
import { ChangesList, DiffDiscardHost, DiffTab } from "../features/diff/DiffViewer";
import { useWorkspaceDiff, type WorkspaceDiff } from "../features/diff/useWorkspaceDiff";
import type { DiffScope, FileDiff } from "../features/diff/types";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { ScriptsPanel } from "./ScriptsPanel";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";
import { usePullRequest } from "../features/pr/usePullRequest";
import { PrControl } from "../features/pr/PrControl";
import { usePrActions } from "../features/pr/usePrActions";
import { createShortcutApplies, mergeShortcutApplies } from "../features/pr/shortcuts";
import type { PrLookup } from "../features/pr/types";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  notify?: (kind: "info" | "error", message: string) => void;
}

// In the desktop app the chat runs Reason (one Reason Session per workspace,
// `features/chat/reasonChat.ts`). The browser preview keeps a local transcript.
const transcripts = new Map<string, ChatTranscript>();
/** The Create-workspace dialog's first message, sent to Reason when the chat opens. */
const firstPrompts = new Map<string, string>();

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
  if (reasonAvailable()) {
    firstPrompts.set(workspaceId, text);
    return;
  }
  transcripts.set(workspaceId, withMessages(emptyTranscript(workspaceId), [textMessage(workspaceId, "user", text)]));
}

interface ChatPanelProps extends Props {
  bridge: MutableRefObject<ChatBridge | null>;
  /** The main area's tab strip. */
  tabs: ReactNode;
  /** Shown instead of the transcript while another tab (the diff) is active; the composer stays. */
  content: ReactNode | null;
  /** The agent started or finished a turn. */
  onRunningChange?: (running: boolean) => void;
}

function ChatPanel({ repo, workspace, dispatch, bridge, tabs, content, onRunningChange }: ChatPanelProps) {
  const reason = reasonAvailable();
  const cwd = workspace.path ?? repo.path;
  const load = () => (reason ? reasonTranscript(workspace.id) : (transcripts.get(workspace.id) ?? emptyTranscript(workspace.id)));
  const [transcript, setTranscript] = useState<ChatTranscript>(load);
  const [draft, setDraft] = useState("");
  /** The turn whose "Reset chat?" dialog is open. */
  const [resetTurn, setResetTurn] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const running = transcript.activeTurn !== null;
  useEffect(() => onRunningChange?.(running), [running, onRunningChange]);

  useEffect(() => {
    setTranscript(load());
    setDraft("");
    setResetTurn(null);
    if (!reason) return;
    const unsubscribe = subscribeReason(workspace.id, setTranscript);
    const first = firstPrompts.get(workspace.id);
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      void sendReason(workspace.id, cwd, first);
    }
    return unsubscribe;
  }, [workspace.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  function sendText(text: string) {
    const first = !transcript.messages.some((m) => m.role === "user");
    if (reason) {
      void sendReason(workspace.id, cwd, text);
      if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
      return;
    }
    const next = withMessages(transcript, [
      textMessage(workspace.id, "user", text),
      textMessage(workspace.id, "system", "Browser preview: Reason runs chats in the desktop app, so this message stays in this workspace's local transcript."),
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
      {tabs}
      {content}
      <div className="chat-scroll" hidden={content !== null}>
        {transcript.messages.length === 0 ? (
          <div className="placeholder">
            <h3>Chat with the agent</h3>
            <p>
              Messages you send here will run an agent inside <code>{workspace.name}</code>'s worktree on branch <code>{workspace.branch}</code>.
            </p>
            <p className="muted">{reason ? "Reason runs this chat: one Reason Session per workspace." : "Browser preview: messages stay in a local transcript."}</p>
          </div>
        ) : (
          <Transcript
            transcript={transcript}
            onRetry={(prompt) => sendText(prompt)}
            // Conductor: workspace with a path, not archived; disabled while the agent works.
            onResetChat={reason && workspace.status !== "archived" ? setResetTurn : undefined}
            resetDisabled={running}
          />
        )}
        <div ref={endRef} />
      </div>
      {resetTurn !== null ? (
        <ResetChatDialog
          loadChangedCount={() => changedSinceTurn(invoke, cwd, workspace.id, resetTurn)}
          onConfirm={(resetFiles) => resetReasonChat(workspace.id, cwd, resetTurn, resetFiles)}
          onClose={() => setResetTurn(null)}
        />
      ) : null}
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
          <span className="composer-actions">
            {running ? (
              <button className="btn btn-small" type="button" title="Stop the agent" onClick={() => stopReason(workspace.id)}>
                Stop
              </button>
            ) : null}
            <button className="btn btn-primary btn-small" type="submit" disabled={!draft.trim()}>
              <SendIcon size={14} /> Send
            </button>
          </span>
        </div>
      </form>
    </section>
  );
}

function RightPanel({ diff, actions }: { diff: WorkspaceDiff; actions: () => ReactNode }) {
  const [tab, setTab] = useState<"changes" | "files">("changes");
  const count = diff.load.state === "ready" ? diff.files.length : null;
  return (
    <section className="diff" aria-label="Changes">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          All files
        </button>
        <button role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          Changes {count ? <span className="tab-count">{count}</span> : null}
        </button>
      </div>
      {tab === "changes" ? (
        <ChangesList diff={diff} actions={actions} />
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

type MainTab = "chat" | "diff";

function MainTabs({ title, active, diffOpen, onSelect, onCloseDiff }: { title: string; active: MainTab; diffOpen: boolean; onSelect: (t: MainTab) => void; onCloseDiff: () => void }) {
  return (
    <div className="tabs main-tabs" role="tablist" aria-label="Workspace tabs">
      {diffOpen && (
        <span className={`main-tab${active === "diff" ? " active" : ""}`}>
          <button role="tab" aria-selected={active === "diff"} className={active === "diff" ? "active" : ""} onClick={() => onSelect("diff")}>
            All changes
          </button>
          <button className="main-tab-close" onClick={onCloseDiff} title="Close tab" aria-label="Close All changes tab">
            ×
          </button>
        </span>
      )}
      <span className={`main-tab${active === "chat" ? " active" : ""}`}>
        <button role="tab" aria-selected={active === "chat"} className={active === "chat" ? "active" : ""} onClick={() => onSelect("chat")} title={title}>
          {title}
        </button>
      </span>
    </div>
  );
}

const STATUS_TEXT: Record<Workspace["status"], string> = {
  idle: "Idle",
  working: "Working",
  "needs-review": "Ready for review",
  archived: "Archived",
};

export function WorkspaceView({ repo, workspace, dispatch, notify }: Props) {
  const [showTerminal, setShowTerminal] = useState(true);
  const chatBridge = useRef<ChatBridge | null>(null);
  const settingUp = useCreateSetupRunning(workspace.id);
  // The "All changes" tab opens when a file is picked in the changes list, and is reused for every file.
  const [diffOpen, setDiffOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("chat");
  useEffect(() => {
    setDiffOpen(false);
    setMainTab("chat");
  }, [workspace.id]);
  const openDiffTab = useCallback(() => {
    setDiffOpen(true);
    setMainTab("diff");
  }, []);
  const closeDiffTab = () => {
    setDiffOpen(false);
    setMainTab("chat");
  };

  // The review hook needs the loaded files and the diff needs the hook's reveal, so loads go through a ref.
  const loaded = useRef<((files: FileDiff[], scope: DiffScope) => void) | null>(null);
  const onLoaded = useCallback((files: FileDiff[], scope: DiffScope) => loaded.current?.(files, scope), []);
  const diff = useWorkspaceDiff({ workspaceId: workspace.id, worktree: workspace.path ?? null, baseBranch: repo.defaultBranch, onLoaded, onOpen: openDiffTab });
  const chat = useMemo<ChatBridge>(() => ({ insert: (t) => chatBridge.current?.insert(t), send: (t) => chatBridge.current?.send(t) }), []);
  const review = useReviewComments(workspace.id, chat, undefined, diff.openPath);
  const [agentWorking, setAgentWorking] = useState(false);
  // Keep the sidebar's PR title (`workspaces.pr_title`) in step with GitHub.
  const onLookup = useCallback(
    (next: PrLookup) => {
      if (next.kind === "found") dispatch({ type: "setWorkspacePr", repoId: repo.id, workspaceId: workspace.id, prTitle: next.info.title });
    },
    [dispatch, repo.id, workspace.id],
  );
  const pullRequest = usePullRequest({ worktree: workspace.path ?? null, branch: workspace.branch, targetBranch: repo.defaultBranch, agentWorking, onLookup });
  const prActions = usePrActions({
    pullRequest,
    worktree: workspace.path ?? null,
    branch: workspace.branch,
    targetBranch: repo.defaultBranch,
    sendToAgent: chat.send,
    notify,
  });
  loaded.current = review.onLoaded;

  const switchTab = () => diffOpen && setMainTab((t) => (t === "chat" ? "diff" : "chat"));
  useKeybindings({
    "view.toggleTerminalPanel": () => setShowTerminal((v) => !v),
    "diff.open": () => (diff.current < 0 && diff.files.length > 0 ? diff.open(0) : openDiffTab()),
    "nav.nextTab": switchTab,
    "nav.previousTab": switchTab,
    "git.createPR": () => {
      if (createShortcutApplies(pullRequest.header, prActions.busy !== null)) void prActions.create(false);
    },
    // Optional checks are not treated as blocking until that setting exists.
    "git.mergePR": () => {
      if (mergeShortcutApplies(pullRequest.pr, false, prActions.busy === "merging")) void prActions.merge();
    },
    "git.openInGitHub": prActions.openOnGitHub,
  });
  const showDiff = diffOpen && mainTab === "diff";
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
          <PrControl pullRequest={pullRequest} actions={prActions} worktree={workspace.path ?? null} />
          <button className="btn btn-small" title="Toggle terminal panel" aria-pressed={showTerminal} onClick={() => setShowTerminal((v) => !v)}>
            Terminal
          </button>
          <button className="btn btn-small" title="Archive workspace" onClick={() => dispatch({ type: "archiveWorkspace", repoId: repo.id, workspaceId: workspace.id })}>
            <ArchiveIcon size={14} /> Archive
          </button>
        </div>
      </header>
      <div className="ws-split">
        <ChatPanel
          repo={repo}
          workspace={workspace}
          dispatch={dispatch}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          tabs={<MainTabs title={workspace.name} active={showDiff ? "diff" : "chat"} diffOpen={diffOpen} onSelect={setMainTab} onCloseDiff={closeDiffTab} />}
          content={showDiff ? <DiffTab diff={diff} onLineClick={review.onLineClick} anchors={review.anchors} annotations={review.annotations} /> : null}
        />
        <div className="ws-right">
          <RightPanel diff={diff} actions={review.actions} />
          <ScriptsPanel repo={repo} workspace={workspace} />
        </div>
      </div>
      {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
      <DiffDiscardHost diff={diff} />
      {showTerminal && <TerminalPanel workspaceId={workspace.id} cwd={repo.path} />}
    </div>
  );
}
