import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon } from "./Icons";
import { Transcript } from "../features/chat/Transcript.tsx";
import { chatSnapshot, queueAction, REASON_CAN_STEER, reasonAvailable, resetReasonChat, sendReason, stopChat, submitChat, subscribeChat, type ChatSnapshot } from "../features/chat/reasonChat.ts";
import { Composer } from "../features/chat/Composer.tsx";
import type { SendMode } from "../features/chat/queue.ts";
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
import { usePullRequest, type PullRequest } from "../features/pr/usePullRequest";
import { useArchiveOnMerge } from "../features/pr/useArchiveOnMerge";
import { ChecksTab } from "../features/pr/checks/ChecksTab";
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

// The chat runs Reason in the desktop app (one Reason Session per workspace,
// `features/chat/reasonChat.ts`); the browser preview uses a stand-in agent.
// Turn lifecycle, Stop and the follow-up queue live in `features/chat/queue.ts`.
/** The Create-workspace dialog's first message, sent when the chat opens. */
const firstPrompts = new Map<string, string>();

/** Queues the Create-workspace dialog's first message for the new workspace's chat. */
export function seedTranscript(workspaceId: string, text: string) {
  firstPrompts.set(workspaceId, text);
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
  const [{ transcript, queue }, setSnapshot] = useState<ChatSnapshot>(() => chatSnapshot(workspace.id));
  const [draft, setDraft] = useState("");
  /** The turn whose "Reset chat?" dialog is open. */
  const [resetTurn, setResetTurn] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const running = transcript.activeTurn !== null;
  useEffect(() => onRunningChange?.(running), [running, onRunningChange]);

  useEffect(() => {
    setSnapshot(chatSnapshot(workspace.id));
    setDraft("");
    setResetTurn(null);
    const unsubscribe = subscribeChat(workspace.id, setSnapshot);
    const first = firstPrompts.get(workspace.id);
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      sendReason(workspace.id, cwd, first);
    }
    return unsubscribe;
  }, [workspace.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  function submit(text: string, mode: SendMode) {
    const first = !transcript.messages.some((m) => m.role === "user");
    submitChat(workspace.id, cwd, text, mode);
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  // The diff viewer adds review comments to the composer and sends Review prompts.
  bridge.current = {
    insert: (text) => {
      setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${text}` : text));
      inputRef.current?.focus();
    },
    send: (text) => submit(text, "queue"),
  };

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
            <p className="muted">{reason ? "Reason runs this chat: one Reason Session per workspace." : "Browser preview: a stand-in agent answers; Reason runs chats in the desktop app."}</p>
          </div>
        ) : (
          <Transcript
            transcript={transcript}
            onRetry={(prompt) => submit(prompt, "queue")}
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
      <Composer
        draft={draft}
        setDraft={setDraft}
        inputRef={inputRef}
        placeholder={`Ask the agent to work in ${workspace.name}…`}
        queue={queue}
        canSteer={REASON_CAN_STEER}
        onSubmit={submit}
        onStop={() => stopChat(workspace.id)}
        onQueue={(action) => queueAction(workspace.id, action)}
      />
    </section>
  );
}

function RightPanel({ diff, actions, pr, worktree }: { diff: WorkspaceDiff; actions: () => ReactNode; pr: PullRequest; worktree: string | null }) {
  const [tab, setTab] = useState<"changes" | "files" | "checks">("changes");
  const count = diff.load.state === "ready" ? diff.files.length : null;
  const checksStatus = pr.pr?.status?.checks.status ?? null;
  return (
    <section className="diff" aria-label="Changes">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "files"} className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>
          All files
        </button>
        <button role="tab" aria-selected={tab === "changes"} className={tab === "changes" ? "active" : ""} onClick={() => setTab("changes")}>
          Changes {count ? <span className="tab-count">{count}</span> : null}
        </button>
        <button role="tab" aria-selected={tab === "checks"} className={tab === "checks" ? "active" : ""} onClick={() => setTab("checks")}>
          Checks {checksStatus ? <span className={`checks-dot ${checksStatus}`} aria-label={checksStatus} /> : null}
        </button>
      </div>
      {tab === "changes" ? (
        <ChangesList diff={diff} actions={actions} />
      ) : tab === "checks" ? (
        <ChecksTab worktree={worktree} pr={pr.pr} refresh={pr.refresh} />
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
  const archiveOnMerge = useArchiveOnMerge({ repo, workspace, dispatch, agentWorking, notify });
  // Keep the sidebar's PR title (`workspaces.pr_title`) in step with GitHub, then archive on merge.
  const onLookup = useCallback(
    (next: PrLookup, previous: PrLookup | null) => {
      if (next.kind === "found") dispatch({ type: "setWorkspacePr", repoId: repo.id, workspaceId: workspace.id, prTitle: next.info.title });
      archiveOnMerge(next, previous);
    },
    [dispatch, repo.id, workspace.id, archiveOnMerge],
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
          <RightPanel diff={diff} actions={review.actions} pr={pullRequest} worktree={workspace.path ?? null} />
          <ScriptsPanel repo={repo} workspace={workspace} />
        </div>
      </div>
      {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
      <DiffDiscardHost diff={diff} />
      {showTerminal && <TerminalPanel workspaceId={workspace.id} cwd={repo.path} />}
    </div>
  );
}
