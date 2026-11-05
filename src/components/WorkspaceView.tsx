import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon, SendIcon } from "./Icons";
import { applyChatEvents, emptyTranscript, type ChatTranscript } from "../features/chat/reducer.ts";
import type { ChatMessage } from "../features/chat/types.ts";
import { Transcript } from "../features/chat/Transcript.tsx";
import { reasonAvailable, reasonTranscript, resetReasonChat, sendReason, stopReason, subscribeReason } from "../features/chat/reasonChat.ts";
import { ResetChatDialog } from "../features/chat/ResetChatDialog.tsx";
import { changedSinceTurn, turnCheckpointRef } from "../features/chat/checkpoints.ts";
import { invoke } from "@tauri-apps/api/core";
import { TurnChanges } from "../features/chat/TurnChanges.tsx";
import type { TurnRef } from "../features/diff/turnChangesCache.ts";
import { ChangesList, DiffDiscardHost, DiffTab } from "../features/diff/DiffViewer";
import { useWorkspaceDiff, type WorkspaceDiff } from "../features/diff/useWorkspaceDiff";
import type { DiffScope, FileDiff } from "../features/diff/types";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { queuePending, ReviewButton, takePendingMessage, useReviewChats, type ReviewTab } from "../features/diff/ReviewButton";
import { attachmentLine } from "../features/chat/reason.ts";
import { addAttachment, revertedNote, type ComposerAttach, type TextAttachment } from "../features/diff/chatAttachment";
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { ScriptsPanel } from "./ScriptsPanel";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";
import { usePullRequest, type PullRequest } from "../features/pr/usePullRequest";
import { useArchiveOnMerge } from "../features/pr/useArchiveOnMerge";
import { ChecksTab } from "../features/pr/checks/ChecksTab";
import { useWorkspacePrSync } from "../features/pr/workspaceSync.ts";
import { PrControl } from "../features/pr/PrControl";
import { usePrActions } from "../features/pr/usePrActions";
import { commitShortcutApplies, createShortcutApplies, mergeShortcutApplies } from "../features/pr/shortcuts";
import type { PrLookup } from "../features/pr/types";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  notify?: (kind: "info" | "error", message: string) => void;
}

// In the desktop app the chat runs Reason (one Reason Session per chat,
// `features/chat/reasonChat.ts`): the workspace's own chat has the workspace
// id, review chats their own. The browser preview keeps a local transcript.
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
  /** The workspace id for the workspace's own chat, or a review chat's id. */
  chatId: string;
  /** Set for a review chat. */
  review?: ReviewTab;
  bridge: MutableRefObject<(ChatBridge & ComposerAttach) | null>;
  /** The main area's tab strip. */
  tabs: ReactNode;
  /** Shown instead of the transcript while another tab (the diff) is active; the composer stays. */
  content: ReactNode | null;
  /** The agent started or finished a turn. */
  onRunningChange?: (running: boolean) => void;
  /** A file chip under a finished turn: open that file's changes from the turn. */
  openTurnFile: (turn: TurnRef, path: string) => void;
}

function ChatPanel({ repo, workspace, dispatch, chatId, review, bridge, tabs, content, onRunningChange, openTurnFile }: ChatPanelProps) {
  const reason = reasonAvailable();
  const cwd = workspace.path ?? repo.path;
  const main = chatId === workspace.id;
  const load = () => (reason ? reasonTranscript(chatId) : (transcripts.get(chatId) ?? emptyTranscript(chatId)));
  const [transcript, setTranscript] = useState<ChatTranscript>(load);
  const [draft, setDraft] = useState("");
  // Text files the diff viewer attached (the revert note after a discard); they go out with the next message.
  const [attachments, setAttachments] = useState<TextAttachment[]>([]);
  /** The turn whose "Reset chat?" dialog is open. */
  const [resetTurn, setResetTurn] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const running = transcript.activeTurn !== null;
  // Only the workspace's own chat counts as the agent working; a review chat does not.
  useEffect(() => {
    if (main) onRunningChange?.(running);
  }, [main, running, onRunningChange]);

  useEffect(() => {
    setTranscript(load());
    setDraft("");
    setAttachments([]);
    setResetTurn(null);
    const pendingMessage = takePendingMessage(chatId);
    if (pendingMessage?.kind === "draft") {
      setDraft(pendingMessage.text);
      inputRef.current?.focus();
    }
    const unsubscribe = reason ? subscribeReason(chatId, setTranscript) : undefined;
    if (pendingMessage?.kind === "send") sendText(pendingMessage.text, pendingMessage.attachments);
    const first = main && reason ? firstPrompts.get(workspace.id) : undefined;
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      void sendReason(workspace.id, cwd, first);
    }
    return unsubscribe;
  }, [chatId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  // Attachments (a review request, revert notes) go to Reason as embedded files and show by name.
  function sendText(text: string, attached: readonly TextAttachment[] = []) {
    const first = main && !load().messages.some((m) => m.role === "user");
    if (reason) {
      void sendReason(chatId, cwd, text, [...attached]);
      if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
      return;
    }
    // One finished turn per message, so its footer (and sample turn changes) show.
    const shown = [text, ...attached.map((a) => attachmentLine(a.name))].join("\n\n");
    const user = textMessage(chatId, "user", shown);
    const reply = { ...textMessage(chatId, "system", "Browser preview: Reason runs chats in the desktop app, so this message stays in this workspace's local transcript."), turnId: user.turnId };
    const done = applyChatEvents(withMessages(load(), [user, reply]), [{ type: "turn_status", sessionId: chatId, turnId: user.turnId, status: "completed" }]);
    const next = done.ok ? done.transcript : withMessages(load(), [user, reply]);
    transcripts.set(chatId, next);
    setTranscript(next);
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  const turnFooter = (turnId: string) => {
    const turn = turnCheckpointRef(chatId, turnId);
    return <TurnChanges turn={turn} worktree={workspace.path ?? null} onOpenFile={(path) => openTurnFile(turn, path)} />;
  };

  // The diff viewer adds review comments to the composer of the chat shown; the PR control sends.
  bridge.current = {
    insert: (text) => {
      setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${text}` : text));
      inputRef.current?.focus();
    },
    send: (text) => sendText(text),
    attach: (a) => setAttachments((list) => addAttachment(list, a)),
  };

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendText(text, attachments);
    setDraft("");
    setAttachments([]);
  }

  return (
    <section className="chat" aria-label="Chat">
      {tabs}
      {content}
      <div className="chat-scroll" hidden={content !== null}>
        {review && (
          <div className="review-chat-info muted" role="note">
            Code review on {review.modelLabel}
            {review.effort ? `, ${review.effort} effort` : ""}
          </div>
        )}
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
            turnFooter={turnFooter}
          />
        )}
        <div ref={endRef} />
      </div>
      {resetTurn !== null ? (
        <ResetChatDialog
          loadChangedCount={() => changedSinceTurn(invoke, cwd, chatId, resetTurn)}
          onConfirm={(resetFiles) => resetReasonChat(chatId, cwd, resetTurn, resetFiles)}
          onClose={() => setResetTurn(null)}
        />
      ) : null}
      <form className="composer" onSubmit={send}>
        {attachments.length > 0 && (
          <div className="composer-attachments" aria-label="Attachments">
            {attachments.map((a) => (
              <span key={a.name} className="chip composer-attachment" title={a.text}>
                {a.name}
                <button type="button" className="composer-attachment-remove" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((list) => list.filter((x) => x.name !== a.name))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
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
              <button className="btn btn-small" type="button" title="Stop the agent" onClick={() => stopReason(chatId)}>
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

function RightPanel({ diff, actions, pr, worktree, review, repo }: { diff: WorkspaceDiff; actions: () => ReactNode; pr: PullRequest; worktree: string | null; review: ReactNode; repo: Repo }) {
  const [tab, setTab] = useState<"changes" | "files" | "checks">("changes");
  // Picking a turn's file in the chat shows that turn's changes list.
  useEffect(() => {
    if (diff.turn) setTab("changes");
  }, [diff.turn]);
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
        {/* Conductor shows Review only while the workspace has changes. */}
        {count ? <span className="tabs-end">{review}</span> : null}
      </div>
      {tab === "changes" ? (
        <ChangesList diff={diff} actions={actions} worktree={worktree} />
      ) : tab === "checks" ? (
        <ChecksTab worktree={worktree} pr={pr.pr} refresh={pr.refresh} repoPath={repo.path} defaultBranch={repo.defaultBranch} />
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

/** "chat" (the workspace's chat), "diff" (All changes) or a review chat's id. */
type MainTab = string;

interface MainTabsProps {
  title: string;
  active: MainTab;
  diffOpen: boolean;
  reviews: ReviewTab[];
  onSelect: (t: MainTab) => void;
  onCloseDiff: () => void;
  onCloseReview: (chatId: string) => void;
}

function MainTabs({ title, active, diffOpen, reviews, onSelect, onCloseDiff, onCloseReview }: MainTabsProps) {
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
      {reviews.map((r) => (
        <span key={r.chatId} className={`main-tab${active === r.chatId ? " active" : ""}`}>
          <button role="tab" aria-selected={active === r.chatId} className={active === r.chatId ? "active" : ""} onClick={() => onSelect(r.chatId)} title={`Code review on ${r.modelLabel}`}>
            {r.title}
          </button>
          <button className="main-tab-close" onClick={() => onCloseReview(r.chatId)} title="Close tab" aria-label={`Close ${r.title} tab`}>
            ×
          </button>
        </span>
      ))}
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
  const chatBridge = useRef<(ChatBridge & ComposerAttach) | null>(null);
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
  // Inserts go to the chat shown; sends (e.g. Create PR) go to the workspace's own chat, switching to it.
  const shownChat = useRef<string>(workspace.id);
  const chat = useMemo<ChatBridge>(
    () => ({
      insert: (t) => chatBridge.current?.insert(t),
      send: (t) => {
        if (shownChat.current === workspace.id) return chatBridge.current?.send(t);
        queuePending(workspace.id, { kind: "send", text: t, attachments: [] });
        setMainTab("chat");
      },
    }),
    [workspace.id],
  );
  const review = useReviewComments(workspace.id, chat, diff.openPath, workspace.path ?? null);
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
  const onDerivedStatus = useWorkspacePrSync({ repoId: repo.id, workspace, dispatch });
  const pullRequest = usePullRequest({ worktree: workspace.path ?? null, branch: workspace.branch, targetBranch: repo.defaultBranch, agentWorking, onLookup, onDerivedStatus });
  const prActions = usePrActions({
    pullRequest,
    repoId: repo.id,
    worktree: workspace.path ?? null,
    branch: workspace.branch,
    targetBranch: repo.defaultBranch,
    sendToAgent: chat.send,
    notify,
  });
  loaded.current = review.onLoaded;
  const reviews = useReviewChats(repo, workspace, setMainTab);
  const closeReview = (chatId: string) => {
    reviews.close(chatId);
    if (mainTab === chatId) setMainTab("chat");
  };
  const canReview = diff.load.state === "ready" && diff.files.length > 0;

  // Cycles All changes, the workspace chat and review chats in strip order.
  const tabOrder = [...(diffOpen ? ["diff"] : []), "chat", ...reviews.tabs.map((r) => r.chatId)];
  const stepTab = (dir: 1 | -1) => setMainTab((t) => tabOrder[(tabOrder.indexOf(t) + dir + tabOrder.length) % tabOrder.length] ?? "chat");
  useKeybindings({
    "view.toggleTerminalPanel": () => setShowTerminal((v) => !v),
    "diff.open": () => (diff.current < 0 && diff.files.length > 0 ? diff.open(0) : openDiffTab()),
    "nav.nextTab": () => stepTab(1),
    "nav.previousTab": () => stepTab(-1),
    "workspace.showReview": () => canReview && void reviews.start(),
    "git.createPR": () => {
      if (createShortcutApplies(pullRequest.header, prActions.busy !== null)) void prActions.create(false);
    },
    "git.commitAndPush": () => {
      if (commitShortcutApplies(pullRequest.header, prActions.busy !== null)) void prActions.commitAndPush();
    },
    "git.mergePR": () => {
      if (mergeShortcutApplies(pullRequest.pr, pullRequest.settings.optionalChecksBlock, prActions.busy === "merging")) void prActions.merge();
    },
    "git.openInGitHub": prActions.openOnGitHub,
  });
  const showDiff = diffOpen && mainTab === "diff";
  const activeReview = reviews.tabs.find((r) => r.chatId === mainTab);
  const activeTab = showDiff ? "diff" : (activeReview?.chatId ?? "chat");
  shownChat.current = activeReview?.chatId ?? workspace.id;
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
          chatId={activeReview?.chatId ?? workspace.id}
          review={activeReview}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          openTurnFile={diff.openTurnFile}
          tabs={<MainTabs title={workspace.name} active={activeTab} diffOpen={diffOpen} reviews={reviews.tabs} onSelect={setMainTab} onCloseDiff={closeDiffTab} onCloseReview={closeReview} />}
          content={showDiff ? <DiffTab diff={diff} onLineClick={review.onLineClick} commentRange={review.commentRange} anchors={review.anchors} annotations={review.annotations} notes={review.notes} /> : null}
        />
        <div className="ws-right">
          <RightPanel
            diff={diff}
            actions={review.actions}
            pr={pullRequest}
            worktree={workspace.path ?? null}
            review={<ReviewButton onReview={() => void reviews.start()} onEdit={() => void reviews.start(true)} error={reviews.error} />}
            repo={repo}
          />
          <ScriptsPanel repo={repo} workspace={workspace} />
        </div>
      </div>
      {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
      <DiffDiscardHost diff={diff} onDiscarded={(f) => chatBridge.current?.attach(revertedNote(f.path))} />
      {showTerminal && <TerminalPanel workspaceId={workspace.id} cwd={repo.path} />}
    </div>
  );
}
