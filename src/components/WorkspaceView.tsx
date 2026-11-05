import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { ArchiveIcon, BranchIcon } from "./Icons";
import { Transcript } from "../features/chat/Transcript.tsx";
import { chatSnapshot, configureReasonDefault, queueAction, REASON_CAN_STEER, reasonAvailable, resetReasonChat, sendReason, stopChat, submitChat, subscribeChat, type ChatSnapshot } from "../features/chat/reasonChat.ts";
import { Composer } from "../features/chat/Composer.tsx";
import { defaultChatConfig } from "../features/chat/chatModel.ts";
import { getSettings } from "../settings/api";
import type { SendMode } from "../features/chat/queue.ts";
import { ResetChatDialog } from "../features/chat/ResetChatDialog.tsx";
import { changedSinceTurn, turnCheckpointRef } from "../features/chat/checkpoints.ts";
import { invoke } from "@tauri-apps/api/core";
import { TurnChanges } from "../features/chat/TurnChanges.tsx";
import type { TurnRef } from "../features/diff/turnChangesCache.ts";
import { ChangesList, DiffDiscardHost, DiffTab } from "../features/diff/DiffViewer";
import { useWorkspaceDiff, type WorkspaceDiff } from "../features/diff/useWorkspaceDiff";
import { showUncommittedChanges, TARGET_REMOTE, targetBranch } from "../features/diff/target";
import type { DiffScope, FileDiff } from "../features/diff/types";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { queuePending, ReviewButton, takePendingMessage, useReviewChats, type ReviewTab } from "../features/diff/ReviewButton";
import { addAttachment, revertedNote, useWorkspaceChatAttach, type ComposerAttach, type TextAttachment } from "../features/diff/chatAttachment";

/** Sends a message with attached text files from the chat shown (Fix errors). */
interface AttachedSend {
  sendWith(text: string, attachments: TextAttachment[]): void;
}
type ShownChatBridge = ChatBridge & ComposerAttach & AttachedSend;
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { ScriptsPanel } from "./ScriptsPanel";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";
import { usePullRequest, type PullRequest } from "../features/pr/usePullRequest";
import { rowPrOf } from "../features/pr/rowPr";
import { useArchiveOnMerge, type ArchiveNotify } from "../features/pr/useArchiveOnMerge";
import { ChecksTab } from "../features/pr/checks/ChecksTab";
import { archiveBlocker } from "../features/archive/archiveGuard";
import { fixShortcutApplies } from "../features/pr/checks/fixErrors";
import { useFixErrors, type FixErrors } from "../features/pr/checks/useFixErrors";
import { useWorkspacePrSync } from "../features/pr/workspaceSync.ts";
import { PrTab } from "../features/pr/PrTab";
import { BranchPicker } from "../features/pr/edit/BranchPicker";
import { useTargetBranch, type TargetBranch } from "../features/pr/useTargetBranch";
import { PrControl } from "../features/pr/PrControl";
import { usePrActions } from "../features/pr/usePrActions";
import { commitShortcutApplies, createShortcutApplies, mergeShortcutApplies } from "../features/pr/shortcuts";
import type { PrLookup } from "../features/pr/types";
import { composerDrafts } from "../lib/local-storage";
import { useAppPrefs } from "../settings/appPrefs";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  notify?: ArchiveNotify;
}

// The chat runs Reason in the desktop app (one Reason Session per chat,
// `features/chat/reasonChat.ts`): the workspace's own chat has the workspace
// id, review chats their own. The browser preview uses a stand-in agent. Turn
// lifecycle, Stop and the follow-up queue live in `features/chat/queue.ts`.
/** The Create-workspace dialog's first message, sent when the chat opens. */
const firstPrompts = new Map<string, string>();

/** Wait after the last keystroke before the composer draft is saved. */
const DRAFT_SAVE_DELAY_MS = 300;

/** Queues the Create-workspace dialog's first message for the new workspace's chat. */
export function seedTranscript(workspaceId: string, text: string) {
  firstPrompts.set(workspaceId, text);
}

interface ChatPanelProps extends Props {
  /** The workspace id for the workspace's own chat, or a review chat's id. */
  chatId: string;
  /** Set for a review chat. */
  review?: ReviewTab;
  bridge: MutableRefObject<ShownChatBridge | null>;
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
  const [{ transcript, queue }, setSnapshot] = useState<ChatSnapshot>(() => chatSnapshot(chatId));
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
  // Garry Mode: tool calls start expanded (Conductor's `garry_mode`, toggled with ⌃O).
  const garryMode = useAppPrefs().garry_mode;

  useEffect(() => {
    setSnapshot(chatSnapshot(chatId));
    setDraft("");
    setAttachments([]);
    setResetTurn(null);
    const pendingMessage = takePendingMessage(chatId);
    if (pendingMessage?.kind === "draft") {
      setDraft(pendingMessage.text);
      inputRef.current?.focus();
    }
    const unsubscribe = subscribeChat(chatId, setSnapshot);
    // The workspace's chat runs the default model unless the New workspace dialog picked one.
    if (main) configureReasonDefault(chatId, getSettings().then(defaultChatConfig));
    if (pendingMessage?.kind === "send") submit(pendingMessage.text, "queue", pendingMessage.attachments);
    const first = main ? firstPrompts.get(workspace.id) : undefined;
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      sendReason(workspace.id, cwd, first, [], repo.path || undefined);
    }
    return unsubscribe;
  }, [chatId]);

  // The draft is kept between launches (`composer-drafts`, keyed by the chat
  // session, which is the workspace): loaded when the workspace opens, saved
  // after typing pauses and when the workspace changes; an empty draft is
  // removed.
  const draftLoadedFor = useRef<string | null>(null);
  const pendingDraft = useRef<{ id: string; text: string } | null>(null);
  const flushDraft = useCallback(() => {
    const p = pendingDraft.current;
    pendingDraft.current = null;
    if (p) void (p.text === "" ? composerDrafts().clear(p.id) : composerDrafts().save(p.id, p.text));
  }, []);
  useEffect(() => {
    let live = true;
    draftLoadedFor.current = null;
    const id = workspace.id;
    composerDrafts()
      .load(id)
      .then(
        (saved) => {
          if (!live) return;
          draftLoadedFor.current = id;
          if (saved) setDraft((d) => (d === "" ? saved : d));
        },
        () => {
          if (live) draftLoadedFor.current = id;
        },
      );
    return () => {
      live = false;
      flushDraft();
    };
  }, [workspace.id, flushDraft]);
  useEffect(() => {
    if (draftLoadedFor.current !== workspace.id) return;
    pendingDraft.current = { id: workspace.id, text: draft };
    const timer = setTimeout(flushDraft, DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, workspace.id, flushDraft]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript]);

  // Attachments (a review request, revert notes) go to Reason as embedded files and show by name.
  function submit(text: string, mode: SendMode, attached: readonly TextAttachment[] = []) {
    const first = main && !chatSnapshot(chatId).transcript.messages.some((m) => m.role === "user");
    submitChat(chatId, cwd, text, mode, attached, repo.path || undefined);
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
    send: (text) => submit(text, "queue"),
    sendWith: (text, attached) => submit(text, "queue", attached),
    attach: (a) => setAttachments((list) => addAttachment(list, a)),
  };

  function onSubmit(text: string, mode: SendMode) {
    submit(text, mode, attachments);
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
            <p className="muted">{reason ? "Reason runs this chat: one Reason Session per workspace." : "Browser preview: a stand-in agent answers; Reason runs chats in the desktop app."}</p>
          </div>
        ) : (
          <Transcript
            transcript={transcript}
            expandToolsByDefault={garryMode}
            onRetry={(prompt) => submit(prompt, "queue")}
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
      <Composer
        draft={draft}
        setDraft={setDraft}
        inputRef={inputRef}
        placeholder={`Ask the agent to work in ${workspace.name}…`}
        queue={queue}
        canSteer={REASON_CAN_STEER}
        onSubmit={onSubmit}
        onStop={() => stopChat(chatId)}
        onQueue={(action) => queueAction(chatId, action)}
        attachments={
          attachments.length > 0 ? (
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
          ) : null
        }
      />
    </section>
  );
}

interface RightPanelProps {
  diff: WorkspaceDiff;
  actions: () => ReactNode;
  pr: PullRequest;
  worktree: string | null;
  review: ReactNode;
  /** Fix errors (shared with the `git.fixErrors` shortcut). */
  fixErrors: FixErrors;
  readOnly: boolean;
}

function RightPanel({ diff, actions, pr, worktree, review, fixErrors, readOnly }: RightPanelProps) {
  const [tab, setTab] = useState<"changes" | "files" | "checks">("changes");
  // Picking a turn's file in the chat shows that turn's changes list.
  useEffect(() => {
    if (diff.turn) setTab("changes");
  }, [diff.turn]);
  // parity:diff.changes-list:ui Cmd+Alt+U: the Changes tab in Uncommitted scope, or back to All changes.
  useKeybindings({
    "workspace.showUncommittedChanges": () => {
      const next = showUncommittedChanges(tab, diff.opts.scope, diff.turn !== null);
      setTab(next.tab);
      diff.update({ scope: next.scope });
    },
  });
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
        <ChecksTab
          worktree={worktree}
          pr={pr.pr}
          refresh={pr.refresh}
          fixErrors={fixErrors}
          readOnly={readOnly}
        />
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

/** "chat" (the workspace's chat), "diff" (All changes), "pr" (the PR tab) or a review chat's id. */
type MainTab = string;

interface MainTabsProps {
  title: string;
  active: MainTab;
  diffOpen: boolean;
  /** "PR #N" while the PR tab is open. */
  prTab: string | null;
  onClosePr: () => void;
  reviews: ReviewTab[];
  onSelect: (t: MainTab) => void;
  onCloseDiff: () => void;
  onCloseReview: (chatId: string) => void;
}

function MainTabs({ title, active, diffOpen, prTab, onClosePr, reviews, onSelect, onCloseDiff, onCloseReview }: MainTabsProps) {
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
      {prTab && (
        <span className={`main-tab${active === "pr" ? " active" : ""}`}>
          <button role="tab" aria-selected={active === "pr"} className={active === "pr" ? "active" : ""} onClick={() => onSelect("pr")}>
            {prTab}
          </button>
          <button className="main-tab-close" onClick={onClosePr} title="Close tab" aria-label={`Close ${prTab} tab`}>
            ×
          </button>
        </span>
      )}
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

/** "→ <target>" in the workspace header: the target branch picker (Conductor's `sxi`). */
function TargetChip({ target, open, setOpen, repo }: { target: TargetBranch; open: boolean; setOpen: (v: boolean) => void; repo: Repo }) {
  const disabled = target.disabledReason !== null || target.changing;
  return (
    <span className="pr-base-anchor target-chip">
      <button
        className="chip"
        disabled={disabled}
        aria-label={`Target branch ${target.branch}`}
        title={target.disabledReason ?? target.error ?? "Target branch"}
        onClick={() => setOpen(!open)}
      >
        → {target.branch}
      </button>
      {open && (
        <BranchPicker
          base={target.branch}
          repoPath={repo.path}
          defaultBranch={repo.defaultBranch}
          onPick={(b) => {
            setOpen(false);
            void target.change(b);
          }}
          onClose={() => setOpen(false)}
        />
      )}
      {target.error && (
        <span className="error small" role="alert">
          {target.error}
        </span>
      )}
    </span>
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
  const chatBridge = useRef<ShownChatBridge | null>(null);
  const settingUp = useCreateSetupRunning(workspace.id);
  // The "All changes" tab opens when a file is picked in the changes list, and is reused for every file.
  const [diffOpen, setDiffOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("chat");
  const [prOpen, setPrOpen] = useState(false);
  const [pickingTarget, setPickingTarget] = useState(false);
  useEffect(() => {
    setDiffOpen(false);
    setPrOpen(false);
    setPickingTarget(false);
    setMainTab("chat");
  }, [workspace.id]);
  const openPrTab = useCallback(() => {
    setPrOpen(true);
    setMainTab("pr");
  }, []);
  const closePrTab = () => {
    setPrOpen(false);
    setMainTab("chat");
  };
  // The branch the work merges into; an open PR's base wins once the lookup answers (useTargetBranch).
  const intendedTarget = workspace.targetBranch || repo.defaultBranch;
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
  // "All changes" is diffed against the open PR's base, else the workspace's target branch (onLookup fills prBase).
  const [prBase, setPrBase] = useState<{ base: string; merged: boolean } | null>(null);
  useEffect(() => setPrBase(null), [workspace.id]);
  const diffTarget = { branch: targetBranch({ prBase: prBase?.base ?? null, prMerged: prBase?.merged ?? false, intended: workspace.targetBranch, fallback: repo.defaultBranch }), remote: TARGET_REMOTE };
  const diff = useWorkspaceDiff({ workspaceId: workspace.id, worktree: workspace.path ?? null, target: diffTarget, onLoaded, onOpen: openDiffTab });
  // Inserts go to the chat shown; sends (e.g. Create PR) go to the workspace's own chat, switching to it.
  const shownChat = useRef<string>(workspace.id);
  // Review comments attach to the workspace's own chat, even while a review chat is shown.
  const attach = useWorkspaceChatAttach(workspace.id, shownChat, chatBridge, useCallback(() => setMainTab("chat"), []));
  const chat = useMemo<ChatBridge & ComposerAttach>(
    () => ({
      attach,
      insert: (t) => chatBridge.current?.insert(t),
      send: (t) => {
        if (shownChat.current === workspace.id) return chatBridge.current?.send(t);
        queuePending(workspace.id, { kind: "send", text: t, attachments: [] });
        setMainTab("chat");
      },
    }),
    [workspace.id, attach],
  );
  // Fix errors goes to the workspace's own chat with its log files attached, and shows that chat.
  const sendToChat = useCallback(
    (text: string, attachments: TextAttachment[]) => {
      if (shownChat.current === workspace.id && chatBridge.current) chatBridge.current.sendWith(text, attachments);
      else queuePending(workspace.id, { kind: "send", text, attachments });
      setMainTab("chat");
    },
    [workspace.id],
  );
  // Archive refuses while a merge or rebase is in progress in the checkout (archiveGuard.ts).
  const [archiving, setArchiving] = useState(false);
  const archive = useCallback(async () => {
    setArchiving(true);
    try {
      const blocked = await archiveBlocker(workspace.path ?? null);
      if (blocked) notify?.("error", blocked);
      else dispatch({ type: "archiveWorkspace", repoId: repo.id, workspaceId: workspace.id });
    } finally {
      setArchiving(false);
    }
  }, [dispatch, notify, repo.id, workspace.id, workspace.path]);
  const fixErrors = useFixErrors({ worktree: workspace.path ?? null, repoId: repo.id, sendToChat, notify });
  const review = useReviewComments(workspace.id, chat, diff.openPath, workspace.path ?? null, notify);
  const [agentWorking, setAgentWorking] = useState(false);
  const archiveOnMerge = useArchiveOnMerge({ repo, workspace, dispatch, agentWorking, notify });
  // Keep the sidebar's PR title and body (`workspaces.pr_title`, `pr_description`) in step with GitHub, then archive on merge.
  // The row's status icon reads the PR too (merged, checks failing, ready to merge, ...).
  const optionalChecksBlock = useRef(false);
  const prTitle = useRef(workspace.prTitle ?? null);
  prTitle.current = workspace.prTitle ?? null;
  const onLookup = useCallback(
    (next: PrLookup, previous: PrLookup | null) => {
      if (next.kind === "found") {
        dispatch({ type: "setWorkspacePr", repoId: repo.id, workspaceId: workspace.id, prTitle: next.info.title, prDescription: next.info.body ?? null, pr: rowPrOf(next.info, optionalChecksBlock.current) });
      } else {
        dispatch({ type: "setWorkspacePr", repoId: repo.id, workspaceId: workspace.id, prTitle: prTitle.current, pr: null });
      }
      setPrBase(next.kind === "found" ? { base: next.info.baseRefName, merged: next.info.isMerged } : null);
      archiveOnMerge(next, previous);
    },
    [dispatch, repo.id, workspace.id, archiveOnMerge],
  );
  const onDerivedStatus = useWorkspacePrSync({ repoId: repo.id, workspace, dispatch });
  const pullRequest = usePullRequest({ worktree: workspace.path ?? null, branch: workspace.branch, targetBranch: intendedTarget, agentWorking, hasPendingComments: review.hasPending, onLookup, onDerivedStatus });
  const target = useTargetBranch({ repo, workspace, pr: pullRequest.pr, refresh: pullRequest.refresh, dispatch });
  optionalChecksBlock.current = pullRequest.settings.optionalChecksBlock;
  useEffect(() => {
    dispatch({ type: "setWorkspaceWorking", repoId: repo.id, workspaceId: workspace.id, working: agentWorking });
  }, [dispatch, repo.id, workspace.id, agentWorking]);
  // Nothing reports a closed workspace's agent, so its row stops showing it working.
  useEffect(() => () => dispatch({ type: "setWorkspaceWorking", repoId: repo.id, workspaceId: workspace.id, working: false }), [dispatch, repo.id, workspace.id]);
  const prActions = usePrActions({
    pullRequest,
    repoId: repo.id,
    repoPath: repo.path,
    worktree: workspace.path ?? null,
    branch: workspace.branch,
    targetBranch: target.branch,
    prTitle: workspace.prTitle,
    prDescription: workspace.prDescription,
    sendToAgent: chat.send,
    addCommentsToChat: review.addAllToChat,
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
  const tabOrder = [...(diffOpen ? ["diff"] : []), "chat", ...(prOpen ? ["pr"] : []), ...reviews.tabs.map((r) => r.chatId)];
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
    "git.fixErrors": () => {
      const failing = pullRequest.pr?.status?.checks.failing ?? [];
      if (fixShortcutApplies(failing, fixErrors.fixing, workspace.status === "archived")) void fixErrors.run(failing);
    },
    "git.openInGitHub": prActions.openOnGitHub,
  });
  const showDiff = diffOpen && mainTab === "diff";
  const showPr = prOpen && mainTab === "pr";
  const activeReview = reviews.tabs.find((r) => r.chatId === mainTab);
  const activeTab = showDiff ? "diff" : showPr ? "pr" : (activeReview?.chatId ?? "chat");
  const prNumber = pullRequest.pr?.number ?? null;
  shownChat.current = activeReview?.chatId ?? workspace.id;
  // Shown unless "right_panel_visible" is false (⌥⌘B / zen mode, bound in App).
  const rightPanelVisible = useAppPrefs().right_panel_visible;
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
          <TargetChip target={target} open={pickingTarget} setOpen={setPickingTarget} repo={repo} />
          {prNumber !== null && (
            <button className="chip pr-chip" title="Open the PR tab" onClick={openPrTab}>
              PR #{prNumber}
            </button>
          )}
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
          <PrControl pullRequest={pullRequest} actions={prActions} />
          <button className="btn btn-small" title="Toggle terminal panel" aria-pressed={showTerminal} onClick={() => setShowTerminal((v) => !v)}>
            Terminal
          </button>
          <button className="btn btn-small" title="Archive workspace" disabled={archiving} aria-busy={archiving} onClick={() => void archive()}>
            <ArchiveIcon size={14} /> Archive
          </button>
        </div>
      </header>
      <div className={`ws-split${rightPanelVisible ? "" : " right-hidden"}`}>
        <ChatPanel
          repo={repo}
          workspace={workspace}
          dispatch={dispatch}
          chatId={activeReview?.chatId ?? workspace.id}
          review={activeReview}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          openTurnFile={diff.openTurnFile}
          tabs={<MainTabs title={workspace.name} active={activeTab} diffOpen={diffOpen} prTab={prOpen ? (prNumber !== null ? `PR #${prNumber}` : "PR") : null} onClosePr={closePrTab} reviews={reviews.tabs} onSelect={setMainTab} onCloseDiff={closeDiffTab} onCloseReview={closeReview} />}
          content={
            showDiff ? (
              <DiffTab diff={diff} onLineClick={review.onLineClick} commentRange={review.commentRange} anchors={review.anchors} annotations={review.annotations} notes={review.notes} />
            ) : showPr ? (
              <PrTab
                worktree={workspace.path ?? null}
                pr={pullRequest.pr}
                refresh={pullRequest.refresh}
                fixErrors={fixErrors}
                readOnly={workspace.status === "archived"}
                repoPath={repo.path}
                defaultBranch={repo.defaultBranch}
                target={target}
              />
            ) : null
          }
        />
        {rightPanelVisible && (
          <div className="ws-right">
            <RightPanel
              diff={diff}
              actions={review.actions}
              pr={pullRequest}
              worktree={workspace.path ?? null}
              review={<ReviewButton onReview={() => void reviews.start()} onEdit={() => void reviews.start(true)} error={reviews.error} />}
              fixErrors={fixErrors}
              readOnly={workspace.status === "archived"}
            />
            <ScriptsPanel repo={repo} workspace={workspace} />
          </div>
        )}
      </div>
      {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
      <DiffDiscardHost diff={diff} onDiscarded={(f) => chatBridge.current?.attach(revertedNote(f.path))} />
      {showTerminal && <TerminalPanel workspaceId={workspace.id} cwd={repo.path} />}
    </div>
  );
}
