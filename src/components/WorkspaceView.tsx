import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { BranchIcon, ChevronIcon, RightSidebarIcon } from "./Icons";
import { toggleRightPanel } from "./panelPrefs";
import { clearManuallyUnread, markManuallyUnread, readOnView, setSelectedChat, setShownChat } from "../state/autoUnread";
import { isChatUnread } from "../state/chatUnread";
import { chatTabStatus, chatTabUnreadDot } from "../state/chatTabUnread";
import { onChatRequest, takeChatRequest } from "../state/openChat";
import { useWindowFocused } from "../state/useAutoUnread";
import { Transcript } from "../features/chat/Transcript.tsx";
import { configureReason, configureReasonDefault, reasonAvailable, reasonChatConfig } from "../features/chat/reasonChat.ts";
import { CHAT_AGENTS, saveAgent, savedAgent, type ChatAgentId } from "../features/chat/agents.ts";
import { chatStatuses, subscribeChatStatuses, type ChatSnapshot, type PermissionPrompt } from "../features/chat/chatRuntime.ts";
import { PermissionRequests, ToolApproval, pendingToolApproval } from "../features/chat/PermissionRequests.tsx";
import { copiedTranscriptMessage, forkAttachmentName, forkTranscript, transcriptOf, turnAgentLabel, type TranscriptKind } from "../features/chat/fork.ts";
import { chatTabMenu, copyTranscriptFailed, NO_CHAT_CONTENT, type ChatTabAction, type ChatTabMenuInput } from "../features/chat/chatTabMenu.ts";
import { RenameChatDialog } from "../features/chat/RenameChatDialog.tsx";
import type { ChatTranscript } from "../features/chat/reducer.ts";
import { ContextMenu, MenuItem, MenuSeparator } from "./menu/ContextMenu";
import { COPIED_LINK, COPY_LINK_FAILED, workspaceLink } from "../workspace/link";
import { inTauri } from "../backend";
import { forkToNewWorkspace } from "../features/chat/forkWorkspace.ts";
import { createWorkspace, ensureRepository } from "../workspace/api";
import { generateWorkspaceNames } from "../workspace/naming";
import { startSetupScript } from "../home/createFirstWorkspace";
import type { ConfigChoice } from "../features/diff/review.ts";
import { Composer } from "../features/chat/Composer.tsx";
import { canMinimize } from "../features/chat/composerMinimize.ts";
import { useComposerMinimize } from "../features/chat/useComposerMinimize.ts";
import { AgentBinaryBanner } from "../features/chat/AgentBinaryBanner.tsx";
import { binaryAgentFor } from "../features/chat/agentBinaries.ts";
import { ChatModelPicker } from "../features/chat/ChatModelPicker.tsx";
import { ChatEmptyState } from "../features/chat/ChatEmptyState.tsx";
import { NewChatButton } from "../features/chat/NewChatButton.tsx";
import { atTabLimit, tabLimitToast } from "../features/chat/chatTabs.ts";
import { chatAfterClose, popClosedTab, pushClosedTab, recordViewedChat } from "../features/chat/closedTabs.ts";
import { lastUserMessageAt, type OtherChat } from "../features/chat/chatEmptyState.ts";
import { AGENT_NAMES, commandSet, isKnownCommand, parseSlashCommand, type ComposerAgent } from "../features/chat/slashCommands.ts";
import { useAgentCommands } from "../features/chat/slashCompletions.ts";
import { defaultChatConfig } from "../features/chat/chatModel.ts";
import { getSettings } from "../settings/api";
import type { SendMode } from "../features/chat/queue.ts";
import { ResetChatDialog } from "../features/chat/ResetChatDialog.tsx";
import { CodexConsentCard } from "../features/chat/CodexConsentCard.tsx";
import type { CodexConsent } from "../features/chat/codexConsent.ts";
import { answerCodex, answerCodexConsent, CODEX_ACCESS, codexAccess, setCodexAccess, type CodexAccess } from "../features/chat/codexChat.ts";
import { DECISION_LABELS, type CodexApproval, type CodexDecision } from "../features/chat/codex.ts";
import { changedSinceTurn, turnCheckpointRef } from "../features/chat/checkpoints.ts";
import { invoke } from "@tauri-apps/api/core";
import { TurnChanges } from "../features/chat/TurnChanges.tsx";
import type { TurnRef } from "../features/diff/turnChangesCache.ts";
import { ChangesList, DiffDiscardHost, DiffTab } from "../features/diff/DiffViewer";
import { filterActive, filterToggleShown, toggleFilter } from "../features/diff/changesFilter";
import { SearchIcon } from "../features/files/panelIcons";
import { Tooltip } from "./ui/Tooltip.tsx";
import { useWorkspaceDiff, type WorkspaceDiff } from "../features/diff/useWorkspaceDiff";
import { showUncommittedChanges, TARGET_REMOTE, targetBranch } from "../features/diff/target";
import type { DiffScope, FileDiff } from "../features/diff/types";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { queuePending, ReviewButton, takePendingMessage, useReviewChats, type ReviewTab } from "../features/diff/ReviewButton";
import { addAttachment, revertedNote, useWorkspaceChatAttach, type ComposerAttach, type TextAttachment } from "../features/diff/chatAttachment";
import { attachmentPath, promptText, randomDir, rejectReason, type ComposerAttachment } from "../features/chat/composerAttachments.ts";
import { draftAttachmentsApi } from "../features/draft-attachments/api.ts";

/** Sends a message with attached text files from the chat shown (Fix errors). */
interface AttachedSend {
  sendWith(text: string, attachments: TextAttachment[]): void;
}
/** The chat tab menu's "Fork to new tab" on the chat shown: forks it with its composer's draft. */
interface ForkShown {
  fork(): void;
}
type ShownChatBridge = ChatBridge & ComposerAttach & AttachedSend & ForkShown;
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { openBigTab } from "../features/terminal/session";
import { bigTabRequest } from "../features/terminal/bigTerminal";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { PRIORITY } from "../keybindings/dispatcher.ts";
import { PanelStrip, type StripView } from "./PanelStrip";
import "./rightPanel.css";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";
import { usePullRequest, type PullRequest } from "../features/pr/usePullRequest";
import { rowPrOf } from "../features/pr/rowPr";
import { useArchiveOnMerge, type ArchiveNotify } from "../features/pr/useArchiveOnMerge";
import { PullLatestButton, usePullLatest } from "../features/pr/usePullLatest.tsx";
import { ChecksTab } from "../features/pr/checks/ChecksTab";
import { fixShortcutApplies } from "../features/pr/checks/fixErrors";
import { useFixErrors, type FixErrors } from "../features/pr/checks/useFixErrors";
import { AllFilesTree, FilesToolbarButtons, useFilesToolbar } from "../features/files/AllFilesTree";
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
import { useBoolPref } from "../settings/useBoolPref";
import { workspaceNumberLabel } from "../state/workspaceNumber";
import { useFollowUpMode } from "../settings/useFollowUpMode";
import { OpenInButton } from "../features/openIn/OpenInButton";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  notify?: ArchiveNotify;
  /** Copy link (`XV`), which the header's W-<n> badge runs. */
  onCopyLink?: () => void;
  /** Opens the next unread chat (the composer's "Next unread" button). */
  onNextUnread?: () => void;
  /** Whether a chat other than `selectedChatId` is unread: the button shows only then. */
  hasNextUnread?: (selectedChatId: string) => boolean;
}

// In the desktop app the workspace's own chat runs the agent picked in the
// composer (`features/chat/agents.ts`): Reason (one Reason Session per chat,
// `features/chat/reasonChat.ts`) or Claude Code (the signed-in `claude` CLI,
// `features/chat/claudeChat.ts`). It has the workspace id; review chats their
// own and always run Reason. The browser preview uses a stand-in agent. Turn
// lifecycle, Stop and the follow-up queue live in `features/chat/queue.ts`.
/** The "/" menu's agent for a chat's agent: Reason runs as an ACP agent. */
const COMPOSER_AGENT: Record<ChatAgentId, ComposerAgent> = { reason: "acp", codex: "codex", claude: "claude" };
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
  /** A file badge in a tool row (repository-relative path): open the file's changes when it has some. */
  openFile?: (path: string) => void;
  /** Opens a forked chat tab on `config` with `draft` in its composer; returns its chat id. */
  forkToNewTab: (title: string, config: ConfigChoice[], draft: { text: string; attachments: TextAttachment[] }) => string;
  /** Every chat tab of the workspace (its own chat and the review and fork tabs), for the empty chat's transcript chips. */
  chatTabs: readonly { chatId: string; title: string }[];
}

/** Conductor's "Branched <branch> from <remote>/<parent>": the workspace's target branch, on origin for a cloned repo. */
function branchedFrom(repo: Repo, workspace: Workspace): string | null {
  const base = workspace.targetBranch ?? repo.defaultBranch;
  if (!base) return null;
  return repo.remote ? `origin/${base}` : base;
}

/** Another chat tab of the workspace, with its last user message, for the empty chat's transcript chips. */
function otherChat(chatId: string, title: string, reason: boolean): OtherChat {
  const agent: ChatAgentId = reason ? savedAgent(chatId) : "reason";
  return { chatId, title, agent, lastUserMessageAt: lastUserMessageAt(agentSnapshot(agent, chatId).transcript.messages) };
}

/** The transcript of the chat shown under `chatId` on `agent` (Claude Code keeps its own chat id). */
const agentSnapshot = (agent: ChatAgentId, chatId: string) => CHAT_AGENTS[agent].snapshot(CHAT_AGENTS[agent].chatId(chatId));

/** The agent a chat runs on: the one picked for it, Reason when only Reason is available. */
const chatAgentOf = (chatId: string): ChatAgentId => (reasonAvailable() ? savedAgent(chatId) : "reason");

/**
 * The chat tab menu's "Copy concise transcript" / "Copy full transcript" and ⌥⌘C
 * (Conductor's chat tab `U`): the chat to the clipboard, then "Copied <kind>
 * transcript of "<title>"", "No chat content to copy" or "Failed to copy <kind> transcript".
 */
async function copyChatTranscript(transcript: ChatTranscript, kind: TranscriptKind, title: string, notify?: ArchiveNotify) {
  const text = transcriptOf(transcript, kind);
  if (!text?.trim()) return notify?.("info", NO_CHAT_CONTENT);
  try {
    await navigator.clipboard.writeText(text);
    notify?.("info", copiedTranscriptMessage(kind, title));
  } catch {
    notify?.("error", copyTranscriptFailed(kind));
  }
}

/**
 * Conductor's "Fork to new tab" (`y9t`): a new tab in the workspace on the
 * source chat's options, with the conversation up to `turnId` (all of it when
 * omitted) attached as "Transcript of <title>.md" and `draft` in its composer.
 * Not sent. Rejects with the error Conductor reports.
 */
async function forkChatToTab(
  src: { chatId: string; title: string; agentId: ChatAgentId; transcript: ChatTranscript; draft: string },
  turnId: string | undefined,
  open: (title: string, config: ConfigChoice[], draft: { text: string; attachments: TextAttachment[] }) => string,
): Promise<void> {
  const markdown = forkTranscript(src.transcript, turnId);
  if (markdown === null) throw new Error("Unable to fork chat to new tab: failed to generate chat transcript");
  // Only Reason chats carry options; a fork of a Codex or Claude Code chat keeps its agent.
  const config = src.agentId === "reason" ? await reasonChatConfig(src.chatId) : [];
  const id = open(`Fork of ${src.title}`, config, { text: src.draft, attachments: [{ name: forkAttachmentName(src.title), text: markdown }] });
  if (src.agentId !== "reason") saveAgent(id, src.agentId);
}

/** Codex asks before a command or patch; the turn waits for the answer. */
function ApprovalCard({ approval, onAnswer }: { approval: CodexApproval; onAnswer: (d: CodexDecision) => void }) {
  return (
    <div className="codex-approval" role="alertdialog" aria-label="Codex approval">
      <div className="codex-approval-title">{approval.kind === "command" ? "Codex wants to run a command" : "Codex wants to change files"}</div>
      {approval.command ? <pre className="codex-approval-command">{approval.command}</pre> : null}
      {approval.reason ? <div className="muted">{approval.reason}</div> : null}
      <div className="codex-approval-actions">
        {approval.decisions.map((d) => (
          <button key={d} type="button" className={`btn btn-small${d === "accept" ? " btn-primary" : ""}`} onClick={() => onAnswer(d)}>
            {DECISION_LABELS[d]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What the chat panel shows: Codex's approvals and consent requests, or the permission requests of Reason and Claude Code. */
type ChatView = Omit<ChatSnapshot, "permissions"> & { permissions?: readonly PermissionPrompt[]; approvals?: CodexApproval[]; consents?: CodexConsent[] };

function ChatPanel({ repo, workspace, dispatch, notify, chatId, review, bridge, tabs, content, onRunningChange, openTurnFile, openFile, onNextUnread, forkToNewTab, chatTabs }: ChatPanelProps) {
  const reason = reasonAvailable();
  const cwd = workspace.path ?? repo.path;
  const main = chatId === workspace.id;
  const [picked, setPicked] = useState<Record<string, ChatAgentId>>({});
  const agentId: ChatAgentId = reason ? (picked[chatId] ?? savedAgent(chatId)) : "reason";
  const agent = CHAT_AGENTS[agentId];
  const codex = agentId === "codex";
  // The "/" menu: Conductor's built-ins for the agent, then the commands and
  // skills the agent reports for this folder (agent_commands backend).
  const reported = useAgentCommands(agentId, cwd);
  const slashCommands = useMemo(
    () => commandSet({ agent: COMPOSER_AGENT[agentId], agentCommands: reported?.slashCommands, skills: reported?.skills }),
    [agentId, reported],
  );
  /** The chat id on the agent's side. */
  const runId = agent.chatId(chatId);
  // Codex's snapshots carry its pending approvals and consent requests; the others' carry permission requests.
  const [{ transcript, queue, approvals = [], consents = [], permissions = [] }, setSnapshot] = useState<ChatView>(() => agent.snapshot(runId));
  const [access, setAccess] = useState<CodexAccess>(() => codexAccess(chatId));
  // The card shows the oldest open request; while it is a plan, the message box asks for changes to it.
  const waiting = permissions[0];
  const planWaiting = waiting?.kind === "plan" ? waiting : undefined;
  // Conductor's composer shows the oldest tool approval in place of its editor (`Jpo`).
  const toolApproval = pendingToolApproval(permissions);
  const [draft, setDraft] = useState("");
  // Files going out with the next message: the user's (staged until sent) and the diff viewer's notes (the revert note after a discard).
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** The turn whose "Reset chat?" dialog is open. */
  const [resetTurn, setResetTurn] = useState<string | null>(null);
  /** A "Fork to new tab" is reading the chat's options. */
  const [forking, setForking] = useState(false);
  /** The turn footer hover's "Opus 5.5 via Reason". */
  const [turnAgent, setTurnAgent] = useState<string | undefined>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const running = transcript.activeTurn !== null;
  // Only the workspace's own chat counts as the agent working; a review chat does not.
  useEffect(() => {
    if (main) onRunningChange?.(running);
  }, [main, running, onRunningChange]);
  // Garry Mode (Conductor's `garry_mode`, "Don't collapse tool calls", toggled with ⌃O): tool
  // groups stay open after the turn ends and tool calls start expanded.
  const garryMode = useAppPrefs().garry_mode;
  // Experimental › "Fork chat to new tab" turns on ⌥⌘↩ (Conductor's `experimental_fork_to_new_tab`).
  const forkTabEnabled = useBoolPref("experimental_fork_to_new_tab");
  const followUpMode = useFollowUpMode();

  useEffect(() => {
    setDraft("");
    setAttachments([]);
    setAttachError(null);
    setAccess(codexAccess(chatId));
  }, [chatId]);

  useEffect(() => {
    setSnapshot(agent.snapshot(runId));
    setResetTurn(null);
    const pendingMessage = takePendingMessage(chatId);
    if (pendingMessage?.kind === "draft") {
      setDraft(pendingMessage.text);
      setAttachments(pendingMessage.attachments ?? []);
      inputRef.current?.focus();
    }
    const unsubscribe = agent.subscribe(runId, setSnapshot);
    // The workspace's Reason chat runs the default model unless the New workspace dialog picked one.
    if (main) configureReasonDefault(chatId, getSettings().then(defaultChatConfig));
    if (pendingMessage?.kind === "send") submit(pendingMessage.text, "queue", pendingMessage.attachments);
    const first = main ? firstPrompts.get(workspace.id) : undefined;
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      agent.submit(runId, cwd, first, "queue", [], repo.path || undefined);
    }
    return unsubscribe;
  }, [chatId, agentId]);

  function pickAgent(next: ChatAgentId) {
    saveAgent(chatId, next);
    setPicked((p) => ({ ...p, [chatId]: next }));
  }

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
  }, [transcript, waiting]);

  // Attachments (a review request, revert notes) go to the agent with the message and show by name.
  function submit(text: string, mode: SendMode, attached: readonly TextAttachment[] = []) {
    const first = main && !agent.snapshot(runId).transcript.messages.some((m) => m.role === "user");
    agent.submit(runId, cwd, text, mode, attached, repo.path || undefined);
    dispatch({ type: "touchWorkspace", repoId: repo.id, workspaceId: workspace.id, at: Date.now() });
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  // The chat's model, for the turn footer hover. A Codex or Claude Code chat names only its agent.
  useEffect(() => {
    let live = true;
    setTurnAgent(agent.label);
    if (agentId === "reason")
      void reasonChatConfig(chatId).then((config) => {
        if (live) setTurnAgent(turnAgentLabel(config.find((o) => o.id === "model")?.value, "Reason"));
      });
    return () => {
      live = false;
    };
  }, [chatId, agentId]);

  /**
   * Conductor's "Fork to new tab" (`y9t`): a new tab in this workspace on this
   * chat's options, with the conversation up to `turnId` (all of it when
   * omitted, as ⌥⌘↩ forks) attached as "Transcript of <title>.md" and this
   * composer's text copied. Not sent.
   */
  async function forkToTab(turnId?: string) {
    setAttachError(null);
    setForking(true);
    try {
      await forkChatToTab({ chatId, title: review?.title ?? workspace.chatTitle ?? workspace.name, agentId, transcript, draft }, turnId, forkToNewTab);
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Failed to fork chat to new tab");
    } finally {
      setForking(false);
    }
  }

  /**
   * Conductor's "Fork to new workspace" (`forkChat`): a new workspace on a
   * branch off this one's, restored to the turn's end checkpoint, whose chat
   * opens on this chat's options with the transcript up to `turnId` attached.
   * Not sent. Opens the new workspace.
   */
  async function forkToWorkspace(turnId: string) {
    setAttachError(null);
    setForking(true);
    try {
      if (!repo.path) throw new Error("Unable to fork chat: workspace not found");
      const backendRepo = await ensureRepository(repo.path, repo.id);
      const taken = repo.workspaces.flatMap((w) => [w.name, w.branch.replace(/^.*\//, "")]);
      const [name] = generateWorkspaceNames(1, taken, Math.random);
      const targetBranch = workspace.targetBranch || backendRepo.defaultBranch;
      const config = await reasonChatConfig(chatId);
      const fork = await forkToNewWorkspace(
        { invoke: (cmd, args) => invoke(cmd, args), createWorkspace },
        {
          repositoryId: backendRepo.id,
          repoRoot: backendRepo.root,
          workspacePath: workspace.path ?? null,
          targetBranch,
          directoryName: name.name,
          chatId,
          turnId,
          transcript: forkTranscript(transcript, turnId),
        },
      );
      const { id, directoryName, branchName, path } = fork.created.workspace;
      const title = review?.title ?? workspace.chatTitle ?? workspace.name;
      configureReason(id, config);
      queuePending(id, { kind: "draft", text: "", attachments: [{ name: forkAttachmentName(title), text: fork.transcript }] });
      await startSetupScript({ id: backendRepo.id, root: backendRepo.root, defaultBranch: backendRepo.defaultBranch }, { id, name: directoryName, path }, targetBranch);
      dispatch({
        type: "addWorkspace",
        repoId: repo.id,
        workspace: { id, name: directoryName, branch: branchName, path, targetBranch, placeholderBranchName: null, userSetWorkspaceName: false, userSetBranchName: false, number: fork.created.number ?? null },
      });
    } catch (e) {
      setAttachError(e instanceof Error ? e.message : "Failed to fork chat");
    } finally {
      setForking(false);
    }
  }

  /** Conductor's "Copy concise transcript": the whole chat in the fork's concise Markdown, to the clipboard. */
  const copyConciseTranscript = () => copyChatTranscript(transcript, "concise", review?.title ?? workspace.chatTitle ?? workspace.name, notify);

  // ⌥⌘C and ⌥⌘↩ act on the chat on screen, as Conductor binds them on the active chat tab
  // (renderApp-D_fmY7hW.js ~7,376,706, priority 100). The fork needs the "Fork chat to new tab"
  // experimental setting and a workspace that is not archived; otherwise the key passes on.
  const chatShown = content === null;
  // Conductor's minimized composer: one row while a file diff or the PR fills the area and the box is empty.
  const minimize = useComposerMinimize(
    !chatShown,
    canMinimize({ draft, hasAttachments: attachments.length > 0 || attachError !== null, approvalWaiting: (waiting !== undefined && !planWaiting) || approvals.length > 0 || consents.length > 0, planWaiting: planWaiting !== undefined }),
  );
  useKeybindings(
    {
      "chat.copyTextConcise": () => {
        if (!chatShown) return false;
        void copyConciseTranscript();
      },
      "chat.forkToNewTab": () => {
        if (!chatShown || !forkTabEnabled || workspace.status === "archived") return false;
        if (!forking) void forkToTab();
      },
    },
    PRIORITY.HIGH,
  );

  const turnFooter = (turnId: string) => {
    const turn = turnCheckpointRef(runId, turnId);
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
    fork: () => {
      if (!forking) void forkToTab();
    },
  };

  /** Stages each file (Conductor's draft attachments); it reaches the workspace when the message is sent. */
  async function attachFiles(files: File[]) {
    setAttachError(null);
    for (const file of files) {
      const why = rejectReason(file);
      if (why) {
        setAttachError(why);
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const relativePath = attachmentPath(file.name, randomDir());
        if (reason) await draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data: bytes });
        const a: ComposerAttachment = { name: relativePath, label: file.name, text: promptText(bytes, relativePath), ...(reason ? { staged: relativePath } : {}) };
        setAttachments((list) => addAttachment(list, a));
      } catch (e) {
        setAttachError(`Failed to attach ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function removeAttachment(a: ComposerAttachment) {
    setAttachments((list) => list.filter((x) => x.name !== a.name));
    if (a.staged) draftAttachmentsApi.remove({ localWorkspaceId: workspace.id, relativePath: a.staged }).catch((e) => console.warn("chat: staged attachment not removed", e));
  }

  /** Copies staged files into the workspace (`.context/attachments/…`), then sends. */
  async function onSubmit(text: string, mode: SendMode) {
    const sending = attachments;
    setAttachments([]);
    setAttachError(null);
    const failed: string[] = [];
    for (const a of sending) {
      if (!a.staged) continue;
      try {
        await draftAttachmentsApi.uploadToWorkspace({ localWorkspaceId: workspace.id, relativePath: a.staged, workspacePath: cwd });
      } catch (e) {
        console.warn("chat: attachment not copied into the workspace", e);
        failed.push(a.label ?? a.name);
      }
    }
    if (failed.length > 0) setAttachError(`Not copied into the workspace (sent inline only): ${failed.join(", ")}`);
    submit(text, mode, sending.map(({ name, text }) => ({ name, text })));
  }

  return (
    <section className="chat" aria-label="Chat">
      {tabs}
      {/* Conductor minimizes the empty composer when the content tab scrolls (onScrollCapture → minimizeIfEmpty). */}
      {content !== null ? (
        <div className="chat-content" onScrollCapture={minimize.minimizeIfEmpty}>
          {content}
        </div>
      ) : null}
      <div className="chat-scroll" hidden={content !== null}>
        {review && !review.fork && !review.blank && (
          <div className="review-chat-info muted" role="note">
            Code review on {review.modelLabel}
            {review.effort ? `, ${review.effort} effort` : ""}
          </div>
        )}
        {transcript.messages.length === 0 ? (
          <ChatEmptyState
            repoName={repo.name}
            directoryName={workspace.directoryName ?? workspace.name}
            state={workspace.state}
            branch={workspace.branch}
            branchedFrom={branchedFrom(repo, workspace)}
            otherChats={chatTabs.filter((t) => t.chatId !== chatId).map((t) => otherChat(t.chatId, t.title, reason))}
            onAttachTranscript={(c) => {
              // Conductor: "Transcript of <title>.md", or "No messages in this chat".
              const text = forkTranscript(agentSnapshot(c.agent, c.chatId).transcript);
              if (text === null) return setAttachError("No messages in this chat");
              setAttachments((list) => addAttachment(list, { name: forkAttachmentName(c.title), text }));
            }}
          />
        ) : (
          <Transcript
            transcript={transcript}
            expandToolsByDefault={garryMode}
            dontCollapseToolCalls={garryMode}
            onRetry={(prompt) => submit(prompt, "queue")}
            // Conductor: workspace with a path, not archived; disabled while the agent works or a plan waits.
            // Reset chat and turn changes come from turn checkpoints (Reason, Claude Code); Codex turns have none yet.
            onResetChat={reason && agent.reset && workspace.status !== "archived" ? setResetTurn : undefined}
            resetDisabled={running || planWaiting !== undefined}
            turnFooter={agent.reset ? turnFooter : undefined}
            workspacePath={cwd}
            onOpenFile={openFile ? (path) => openFile(path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path) : undefined}
            // Conductor: any turn of a chat in a workspace that is not archived; disabled while a fork is made.
            onForkToNewTab={workspace.status !== "archived" ? (turnId: string) => void forkToTab(turnId) : undefined}
            // Conductor: the same, and only for a workspace on this machine. It restores the turn's
            // end checkpoint under the Reason chat id, so Codex and Claude Code chats do not offer it yet.
            onForkToNewWorkspace={reason && agentId === "reason" && workspace.path && workspace.status !== "archived" ? (turnId) => void forkToWorkspace(turnId) : undefined}
            forkDisabled={forking}
            turnAgent={turnAgent}
            chatAgent={agentId}
          />
        )}
        <div ref={endRef} />
      </div>
      {resetTurn !== null ? (
        <ResetChatDialog
          loadChangedCount={() => changedSinceTurn(invoke, cwd, runId, resetTurn)}
          onConfirm={(resetFiles) => (agent.reset ? agent.reset(runId, cwd, resetTurn, resetFiles) : Promise.resolve())}
          onClose={() => setResetTurn(null)}
        />
      ) : null}
      <PermissionRequests permissions={permissions} onAnswer={(requestId, answer) => void agent.answerPermission?.(runId, requestId, answer)} onStop={() => agent.stop(runId)} />
      {codex && approvals.length > 0 ? (
        <div className="codex-approvals">
          {approvals.map((a) => (
            <ApprovalCard key={String(a.requestId)} approval={a} onAnswer={(d) => void answerCodex(chatId, a.requestId, d)} />
          ))}
        </div>
      ) : null}
      {codex && consents.length > 0 ? (
        <div className="codex-approvals">
          {consents.map((c) => (
            <CodexConsentCard key={String(c.requestId)} consent={c} onRespond={(answer) => void answerCodexConsent(chatId, c.requestId, answer)} />
          ))}
        </div>
      ) : null}
      {onNextUnread ? (
        // parity:sidebar.ws-unread — Conductor's g1o (renderApp @7,528,638): a small outline
        // "Next unread" button with a chevron, 40px above the composer's right edge.
        <div className="next-unread-anchor">
          <button type="button" className="btn btn-small next-unread" onClick={onNextUnread}>
            <span>Next unread</span>
            <ChevronIcon size={12} />
          </button>
        </div>
      ) : null}
      <AgentBinaryBanner agent={binaryAgentFor(agentId)} />
      {toolApproval ? (
        <div className="composer-wrap">
          <div className="oc-composer-anchor">
            <div className="composer oc-composer is-approval">
              <ToolApproval key={toolApproval.requestId} request={toolApproval} onAnswer={(requestId, answer) => void agent.answerPermission?.(runId, requestId, answer)} />
            </div>
          </div>
        </div>
      ) : null}
      {/* The composer stays mounted (draft, queue) but hidden while a tool approval takes its place. */}
      <div className="oc-composer-slot" hidden={toolApproval !== undefined}>
      <Composer
        draft={draft}
        setDraft={setDraft}
        inputRef={inputRef}
        // Conductor: while a plan waits, the message box asks for changes to it; otherwise its own placeholders.
        placeholder={planWaiting ? "Enter your plan adjustments here..." : undefined}
        queue={queue}
        canSteer={agent.canSteer}
        followUpMode={followUpMode}
        onSubmit={planWaiting ? (text) => void agent.answerPermission?.(runId, planWaiting.requestId, { kind: "plan", approved: false, feedback: text }) : onSubmit}
        onStop={() => agent.stop(runId)}
        onQueue={(action) => agent.queueAction(runId, action)}
        onAttachFiles={(files) => void attachFiles(files)}
        controls={
          // Codex's access mode; the agent itself is picked in the model picker.
          codex ? (
            <select
              className="agent-select codex-access"
              aria-label="Codex access"
              value={access}
              disabled={running}
              onChange={(e) => {
                const next = e.target.value as CodexAccess;
                setAccess(next);
                void setCodexAccess(chatId, next);
              }}
            >
              {(Object.keys(CODEX_ACCESS) as CodexAccess[]).map((k) => (
                <option key={k} value={k}>
                  {CODEX_ACCESS[k].label}
                </option>
              ))}
            </select>
          ) : null
        }
        picker={
          review && !review.blank ? (
            <span className="oc-review-model">{review.modelLabel}</span>
          ) : (
            // A review chat keeps its model. The agent changes only while no turn runs and no message waits, so queued messages never move to another agent.
            <ChatModelPicker chatId={chatId} agent={agentId} onAgentChange={reason && queue.status === "idle" && queue.items.length === 0 ? pickAgent : undefined} />
          )
        }
        slashCommands={slashCommands}
        onCommand={(text) => {
          // Conductor's built-in effects are not wired here yet; the agent's own commands and skills go to the agent as typed.
          const cmd = parseSlashCommand(text, isKnownCommand);
          if (!cmd || slashCommands.some((c) => c.name === cmd.name && (c.effect === "agent" || c.effect === "skill"))) return false;
          const who = agentId === "reason" ? "Reason" : AGENT_NAMES[COMPOSER_AGENT[agentId]];
          setAttachError(cmd.name === "plan" ? "Plan mode is not available in this chat." : `/${cmd.name} is not available for ${who}.`);
          return true;
        }}
        minimize={minimize}
        attachments={
          attachments.length > 0 || attachError ? (
            <div className="composer-attachments" aria-label="Attachments">
              {attachments.map((a) => (
                <span key={a.name} className="chip composer-attachment" title={a.staged ?? a.text}>
                  {a.label ?? a.name}
                  <button type="button" className="composer-attachment-remove" aria-label={`Remove ${a.label ?? a.name}`} onClick={() => removeAttachment(a)}>
                    ×
                  </button>
                </span>
              ))}
              {attachError ? (
                <span className="error small" role="alert">
                  {attachError}
                </span>
              ) : null}
            </div>
          ) : null
        }
      />
      </div>
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
  notify?: ArchiveNotify;
  /** Under the empty Changes list: "Pull latest from <target>" (shared with the `git.pull` shortcut). */
  emptyAction?: ReactNode;
}

function RightPanel({ diff, actions, pr, worktree, review, fixErrors, readOnly, notify, emptyAction }: RightPanelProps) {
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
  const files = useFilesToolbar();
  // parity:diff.changes-list:ui Conductor's "Filter files" (changesFilter.ts): the toggle sits after Review, the row in ChangesList.
  const [changesFilter, setChangesFilter] = useState({ open: false, query: "" });
  useEffect(() => setChangesFilter({ open: false, query: "" }), [worktree]);
  const filterOn = filterActive(changesFilter.open, changesFilter.query);
  const filter = {
    ...changesFilter,
    setQuery: (query: string) => setChangesFilter({ open: true, query }),
    close: () => setChangesFilter({ open: false, query: "" }),
  };
  const tabButton = (id: typeof tab, label: ReactNode) => (
    <button type="button" role="tab" aria-selected={tab === id} className={`rp-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );
  return (
    <section className="diff" aria-label="Changes">
      {/* Conductor's right panel: All files, Changes N, Checks, then the tab's own icons at the right end. */}
      <div className="rp-tabs" role="tablist">
        {tabButton("files", "All files")}
        {tabButton("changes", <>Changes {count ? <span className="tab-count">{count}</span> : null}</>)}
        {tabButton("checks", <>Checks {checksStatus ? <span className={`checks-dot ${checksStatus}`} aria-label={checksStatus} /> : null}</>)}
        <span className="rp-tabs-end">
          {tab === "files" && <FilesToolbarButtons toolbar={files} />}
          {/* Conductor shows Review only while the workspace has changes. */}
          {tab === "changes" && count ? review : null}
          {tab === "changes" && filterToggleShown(filterOn, count ?? 0) && (
            <Tooltip content="Filter files">
              <button
                type="button"
                className={`rp-icon${filterOn ? " on" : ""}`}
                aria-label="Filter files"
                aria-pressed={filterOn}
                onClick={() => setChangesFilter((f) => toggleFilter(f.open, f.query))}
              >
                <SearchIcon size={12} />
              </button>
            </Tooltip>
          )}
        </span>
      </div>
      {tab === "changes" ? (
        <ChangesList diff={diff} actions={actions} worktree={worktree} emptyAction={emptyAction} filter={filter} />
      ) : tab === "checks" ? (
        <ChecksTab
          worktree={worktree}
          pr={pr.pr}
          refresh={pr.refresh}
          fixErrors={fixErrors}
          readOnly={readOnly}
        />
      ) : (
        <AllFilesTree worktree={worktree} notify={notify} toolbar={files} />
      )}
    </section>
  );
}

/** "chat" (the workspace's chat), "diff" (All changes), "pr" (the PR tab) or a review chat's id. */
type MainTab = string;

/** The tab that shows `chatId` of the workspace: "chat" for its own chat (or none), else the review chat's id. */
function tabOfChat(workspaceId: string, chatId: string | undefined): MainTab {
  return chatId === undefined || chatId === workspaceId ? "chat" : chatId;
}

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
  /** The workspace's own chat id (its tab is "chat"). */
  mainChatId: string;
  isUnread: (chatId: string) => boolean;
  /** What the chat tab menu offers for a chat (chatTabMenu.ts). */
  menuFor: (chatId: string) => ChatTabMenuInput;
  /** An item picked in a chat tab's menu. */
  onMenuAction: (chatId: string, action: ChatTabAction) => void;
  /** The "+" after the chat tabs (NewChatButton). */
  newChat: ReactNode;
}

function MainTabs({ title, active, diffOpen, prTab, onClosePr, reviews, onSelect, onCloseDiff, onCloseReview, mainChatId, isUnread, menuFor, onMenuAction, newChat }: MainTabsProps) {
  const [menu, setMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const openMenu = (chatId: string) => (e: ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ chatId, x: e.clientX, y: e.clientY });
  };
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  // Conductor's l8i before the chat tab's title: an 8px --unread dot while the chat is unread and idle.
  const unreadDot = (chatId: string) => (chatTabUnreadDot(isUnread(chatId), chatTabStatus(statuses, chatId)) ? <ChatTabUnreadDot /> : null);
  return (
    <div className="tabs main-tabs" role="tablist" aria-label="Workspace tabs">
      {menu && <ChatTabMenu at={menu} input={menuFor(menu.chatId)} onSelect={(action) => onMenuAction(menu.chatId, action)} onClose={() => setMenu(null)} />}
      {diffOpen && (
        <span className={`main-tab${active === "diff" ? " active" : ""}`}>
          <button role="tab" aria-selected={active === "diff"} className={active === "diff" ? "active" : ""} onClick={() => onSelect("diff")}>
            All changes
          </button>
          <button className="main-tab-close" onClick={onCloseDiff} aria-label="Close All changes tab">
            ×
          </button>
        </span>
      )}
      <span className={`main-tab${active === "chat" ? " active" : ""}`}>
        <button role="tab" aria-selected={active === "chat"} className={active === "chat" ? "active" : ""} onClick={() => onSelect("chat")} onContextMenu={openMenu(mainChatId)} data-unread={isUnread(mainChatId) || undefined}>
          {unreadDot(mainChatId)}
          {title}
        </button>
      </span>
      {prTab && (
        <span className={`main-tab${active === "pr" ? " active" : ""}`}>
          <button role="tab" aria-selected={active === "pr"} className={active === "pr" ? "active" : ""} onClick={() => onSelect("pr")}>
            {prTab}
          </button>
          <button className="main-tab-close" onClick={onClosePr} aria-label={`Close ${prTab} tab`}>
            ×
          </button>
        </span>
      )}
      {reviews.map((r) => (
        <span key={r.chatId} className={`main-tab${active === r.chatId ? " active" : ""}`}>
          <button role="tab" aria-selected={active === r.chatId} className={active === r.chatId ? "active" : ""} onClick={() => onSelect(r.chatId)} onContextMenu={openMenu(r.chatId)} data-unread={isUnread(r.chatId) || undefined} title={r.fork || r.blank ? r.title : `Code review on ${r.modelLabel}`}>
            {unreadDot(r.chatId)}
            {r.title}
          </button>
          <button className="main-tab-close" onClick={() => onCloseReview(r.chatId)} aria-label={`Close ${r.title} tab`}>
            ×
          </button>
        </span>
      ))}
      {newChat}
    </div>
  );
}

/** Conductor's unread mark: lucide `circle` (r=10 of 24), size-2, filled with --unread, transparent stroke. */
function ChatTabUnreadDot() {
  return (
    <svg className="main-tab-unread" data-testid="chat-tab-unread" width="8" height="8" viewBox="0 0 24 24" aria-label="Unread" role="img">
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="transparent" strokeWidth="2" />
    </svg>
  );
}

/**
 * A chat tab's right-click menu (Conductor's `u8i` menu, renderApp-D_fmY7hW.js
 * @7,377,893, `min-w-[200px]`): read state, Rename chat, Fork to new tab, the
 * transcript and link copies, Close tab and Close others (chatTabMenu.ts).
 */
function ChatTabMenu({ at, input, onSelect, onClose }: { at: { x: number; y: number }; input: ChatTabMenuInput; onSelect: (action: ChatTabAction) => void; onClose: () => void }) {
  return (
    <ContextMenu at={at} label="Chat actions" className="cm-min-w-200" onClose={onClose}>
      {chatTabMenu(input).map((e, i) =>
        e.kind === "separator" ? (
          <MenuSeparator key={`sep-${i}`} />
        ) : (
          <MenuItem key={e.id} shortcut={e.shortcut} disabled={e.disabled} onSelect={() => onSelect(e.id)}>
            {e.label}
          </MenuItem>
        ),
      )}
    </ContextMenu>
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
          repoId={repo.id}
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

export function WorkspaceView({ repo, workspace, dispatch, notify, onCopyLink, onNextUnread, hasNextUnread }: Props) {
  // The right panel's Setup / Run / Terminal strip: open on Run, like Conductor.
  // ⌘J (view.toggleTerminalPanel) hides or shows it; ⌘⇧T opens a big terminal
  // in it while Big terminal mode is on.
  const [stripOpen, setStripOpen] = useState(true);
  const [stripView, setStripView] = useState<StripView>("run");
  useEffect(() => setStripView("run"), [workspace.id]);
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
    // Go to next unread or a row click may have asked for one of its chats (state/openChat.ts).
    setMainTab(tabOfChat(workspace.id, takeChatRequest(workspace.id)));
    return onChatRequest((id) => {
      if (id === workspace.id) setMainTab(tabOfChat(workspace.id, takeChatRequest(workspace.id)));
    });
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
    pushClosedTab(workspace.id, { kind: "diff" });
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
  const pullLatest = usePullLatest({
    pullRequest,
    worktree: workspace.path ?? null,
    targetBranch: target.branch,
    readOnly: workspace.status === "archived",
    sendToAgent: chat.send,
    refreshChanges: diff.refresh,
    notify,
  });
  // Conductor binds git.pull (⌘⇧L) at priority HIGH, over the global openSidecarLogs on the same keys.
  useKeybindings({ "git.pull": pullLatest.shortcut }, PRIORITY.HIGH);
  loaded.current = review.onLoaded;
  const reviews = useReviewChats(repo, workspace, setMainTab);
  // The workspace's own chat plus its review, fork and new chats count toward Conductor's tab limit.
  const openChatTabs = 1 + reviews.tabs.length;
  const newChat = () => {
    if (atTabLimit(openChatTabs)) notify?.("info", tabLimitToast());
    else reviews.newChat();
  };
  // Closing the chat on screen shows the chat viewed before it that is still open (closedTabs.ts).
  const closeReview = (chatId: string) => {
    // A closed review counts as hidden: it no longer keeps the workspace unread.
    if (isChatUnread(workspace, chatId)) dispatch({ type: "setChatUnread", repoId: repo.id, workspaceId: workspace.id, chatId, unread: false, at: Date.now() });
    clearManuallyUnread(chatId);
    const tab = reviews.tabs.find((r) => r.chatId === chatId);
    if (tab) pushClosedTab(workspace.id, { kind: "chat", tab });
    reviews.close(chatId);
    if (mainTab === chatId) setMainTab(chatAfterClose(workspace.id, chatId, ["chat", ...reviews.tabs.map((r) => r.chatId)]) ?? "chat");
  };
  const canReview = diff.load.state === "ready" && diff.files.length > 0;

  // Cycles All changes, the workspace chat and review chats in strip order.
  const tabOrder = [...(diffOpen ? ["diff"] : []), "chat", ...(prOpen ? ["pr"] : []), ...reviews.tabs.map((r) => r.chatId)];
  const stepTab = (dir: 1 | -1) => setMainTab((t) => tabOrder[(tabOrder.indexOf(t) + dir + tabOrder.length) % tabOrder.length] ?? "chat");
  useKeybindings({
    "view.toggleTerminalPanel": () => setStripOpen((v) => !v),
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
  // ⌘⇧T inside a terminal is handled by the terminal itself (session.ts), so this one skips terminal focus.
  // So is ⌘T (terminal.newTab); elsewhere ⌘T (nav.newTab) opens a new chat, as the "+" does.
  useKeybindings(
    {
      "nav.newTab": () => {
        newChat();
        return true;
      },
      "terminal.newBigTab": () => {
        const big = bigTabRequest();
        if (!big || !repo.path) return false;
        void openBigTab(workspace.id, repo.path, big)
          .catch(() => {})
          .finally(() => {
            setStripView("terminal");
            setStripOpen(true);
          });
        return true;
      },
    },
    { enableOnTerminalFocus: false },
  );
  const showDiff = diffOpen && mainTab === "diff";
  const showPr = prOpen && mainTab === "pr";
  const activeReview = reviews.tabs.find((r) => r.chatId === mainTab);
  const activeTab = showDiff ? "diff" : showPr ? "pr" : (activeReview?.chatId ?? "chat");
  const prNumber = pullRequest.pr?.number ?? null;
  useEffect(() => {
    if (activeTab !== "diff" && activeTab !== "pr") recordViewedChat(workspace.id, activeTab);
  }, [workspace.id, activeTab]);
  // ⌘W closes the tab on screen and ⌘⇧T reopens the last closed one, as Conductor's workspace
  // view does. The workspace's own chat has no close button here, so ⌘W leaves it. Inside a
  // terminal ⌘W is terminal.closeTab, which the terminal handles itself (session.ts).
  useKeybindings(
    {
      "nav.closeTab": () => {
        if (activeTab === "diff") closeDiffTab();
        else if (activeTab === "pr") closePrTab();
        else if (activeTab !== "chat") closeReview(activeTab);
      },
      "nav.reopenTab": () => {
        const tab = popClosedTab(workspace.id);
        if (tab?.kind === "chat") reviews.reopen(tab.tab);
        else if (tab?.kind === "diff") openDiffTab();
      },
    },
    { enableOnTerminalFocus: false },
  );
  shownChat.current = activeReview?.chatId ?? workspace.id;
  // The chat whose transcript is on screen (none while the diff or PR tab is open): auto-unread
  // skips it while the window has focus, and an unread workspace shown that way is read.
  const transcriptShown = showDiff || showPr ? null : shownChat.current;
  const focused = useWindowFocused();
  useEffect(() => {
    setShownChat(transcriptShown);
    return () => setShownChat(null);
  }, [transcriptShown]);
  // The selected chat tab (Conductor's selectedSessionId): the row menu's "Mark as unread" marks it.
  const selectedChat = shownChat.current;
  useEffect(() => {
    setSelectedChat(selectedChat);
    return () => setSelectedChat(null);
  }, [selectedChat]);
  // Showing a chat (again) drops its hand mark (yIo's mount effect).
  useEffect(() => clearManuallyUnread(selectedChat), [selectedChat]);
  useEffect(() => {
    const chatId = readOnView(workspace, { shownChatId: transcriptShown, focused });
    if (chatId) dispatch({ type: "setChatUnread", repoId: repo.id, workspaceId: workspace.id, chatId, unread: false, at: Date.now() });
  }, [workspace, transcriptShown, focused, dispatch, repo.id]);
  const toggleChatRead = (chatId: string) => {
    const unread = !isChatUnread(workspace, chatId);
    if (unread) markManuallyUnread(chatId);
    else clearManuallyUnread(chatId);
    dispatch({ type: "setChatUnread", repoId: repo.id, workspaceId: workspace.id, chatId, unread, at: Date.now() });
  };
  // The workspace's own chat tab shows its renamed title, else the workspace name.
  const mainTitle = workspace.chatTitle ?? workspace.name;
  const tabTitle = (chatId: string) => (chatId === workspace.id ? mainTitle : (reviews.tabs.find((t) => t.chatId === chatId)?.title ?? mainTitle));
  const tabOf = (chatId: string): MainTab => (chatId === workspace.id ? "chat" : chatId);
  const archived = workspace.status === "archived";
  const forkTabEnabled = useBoolPref("experimental_fork_to_new_tab");
  /** The chat whose "Rename chat" dialog is open. */
  const [renamingChat, setRenamingChat] = useState<string | null>(null);
  useEffect(() => setRenamingChat(null), [workspace.id]);
  const chatMenuInput = (chatId: string): ChatTabMenuInput => ({
    unread: isChatUnread(workspace, chatId),
    canRename: !archived,
    archived,
    forkEnabled: forkTabEnabled,
    forking: false,
    // The workspace's own chat has no close button here.
    closable: chatId !== workspace.id,
    hasOtherTabs: reviews.tabs.some((t) => t.chatId !== chatId),
  });
  /** "Rename chat": stored, then shown on the tab; a failed save keeps the dialog open. */
  const renameChat = async (chatId: string, title: string) => {
    try {
      if (chatId !== workspace.id) return await reviews.rename(chatId, title);
      if (inTauri()) await invoke("db_rename_chat", { chatId, workspaceId: workspace.id, title });
      dispatch({ type: "setChatTitle", repoId: repo.id, workspaceId: workspace.id, title });
    } catch (e) {
      throw new Error(`Failed to rename chat: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onChatMenu = (chatId: string, action: ChatTabAction) => {
    switch (action) {
      case "toggle-read":
        return toggleChatRead(chatId);
      case "rename":
        return setRenamingChat(chatId);
      case "fork":
        // The chat on screen forks with its composer's draft, as ⌥⌘↩ does; another tab's chat without one.
        if (chatId === shownChat.current && chatBridge.current) return chatBridge.current.fork();
        return void forkChatToTab({ chatId, title: tabTitle(chatId), agentId: chatAgentOf(chatId), transcript: agentSnapshot(chatAgentOf(chatId), chatId).transcript, draft: "" }, undefined, reviews.fork).catch((e: unknown) =>
          notify?.("error", e instanceof Error ? e.message : "Failed to fork chat to new tab"),
        );
      case "copy-concise":
      case "copy-complete":
        return void copyChatTranscript(agentSnapshot(chatAgentOf(chatId), chatId).transcript, action === "copy-concise" ? "concise" : "complete", tabTitle(chatId), notify);
      case "copy-link":
        // Conductor's `XV` with the chat: the workspace link plus `&session=<chat id>`.
        return void Promise.resolve()
          .then(() => navigator.clipboard.writeText(workspaceLink(workspace.id, chatId)))
          .then(
            () => notify?.("info", COPIED_LINK),
            () => notify?.("error", COPY_LINK_FAILED),
          );
      case "close":
        return closeReview(chatId);
      case "close-others":
        // Every other closable tab closes and this chat is shown (Conductor's `H`).
        for (const t of reviews.tabs) if (t.chatId !== chatId) closeReview(t.chatId);
        return setMainTab(tabOf(chatId));
    }
  };
  // Shown unless "right_panel_visible" is false (⌥⌘B / zen mode, bound in App).
  const prefs = useAppPrefs();
  const rightPanelVisible = prefs.right_panel_visible;
  const showNumbers = useBoolPref("experimental_show_workspace_numbers");
  const numberLabel = showNumbers ? workspaceNumberLabel(workspace.number) : null;
  return (
    <div className="workspace">
      <header className="ws-header" data-tauri-drag-region="deep">
        <div className="ws-title">
          <span className="crumb">{repo.name}</span>
          <span className="crumb-sep">/</span>
          <strong>{workspace.name}</strong>
          {/* "Show workspace numbers": Conductor's header badge (`Plo`), a W-<n> button whose click is Copy link. */}
          {numberLabel && (
            <button type="button" className="ws-number" title="Copy link" aria-label={`Copy link to ${numberLabel}`} onClick={onCopyLink} disabled={!onCopyLink}>
              {numberLabel}
            </button>
          )}
          <span className="chip">
            <BranchIcon size={12} /> {workspace.branch}
          </span>
          <TargetChip target={target} open={pickingTarget} setOpen={setPickingTarget} repo={repo} />
          {prNumber !== null && (
            <button className="chip pr-chip" title="Open the PR tab" onClick={openPrTab}>
              PR #{prNumber}
            </button>
          )}
          {settingUp && (
            <span className="chip status setting-up" role="status">
              <span className="status-dot working" /> {RUNNING_SETUP}
            </span>
          )}
        </div>
        <div className="ws-actions">
          {workspace.status !== "archived" && <OpenInButton path={workspace.path ?? null} notify={notify} />}
          <PrControl pullRequest={pullRequest} actions={prActions} />
          <button
            className={`btn btn-small btn-icon${rightPanelVisible ? " active" : ""}`}
            title="Toggle right sidebar ⌥⌘B"
            aria-label="Toggle right sidebar"
            aria-pressed={rightPanelVisible}
            onClick={toggleRightPanel}
          >
            <RightSidebarIcon size={12} />
          </button>
        </div>
      </header>
      <div className={`ws-split${rightPanelVisible ? "" : " right-hidden"}`}>
        <ChatPanel
          repo={repo}
          workspace={workspace}
          dispatch={dispatch}
          notify={notify}
          chatId={activeReview?.chatId ?? workspace.id}
          review={activeReview}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          openTurnFile={diff.openTurnFile}
          openFile={diff.openPath}
          // Conductor hides the button once the workspace's PR is merged (g1o's `hidden`, `mIo` isMerged).
          onNextUnread={!prBase?.merged && hasNextUnread?.(selectedChat) ? onNextUnread : undefined}
          forkToNewTab={reviews.fork}
          chatTabs={[{ chatId: workspace.id, title: mainTitle }, ...reviews.tabs.map((r) => ({ chatId: r.chatId, title: r.title }))]}
          tabs={<MainTabs title={mainTitle} active={activeTab} diffOpen={diffOpen} prTab={prOpen ? (prNumber !== null ? `PR #${prNumber}` : "PR") : null} onClosePr={closePrTab} reviews={reviews.tabs} onSelect={setMainTab} onCloseDiff={closeDiffTab} onCloseReview={closeReview} mainChatId={workspace.id} isUnread={(chatId) => isChatUnread(workspace, chatId)} menuFor={chatMenuInput} onMenuAction={onChatMenu} newChat={<NewChatButton openTabs={openChatTabs} onNewChat={newChat} />} />}
          content={
            showDiff ? (
              <DiffTab diff={diff} onLineClick={review.onLineClick} commentRange={review.commentRange} anchors={review.anchors} annotations={review.annotations} notes={review.notes} notify={notify} />
            ) : showPr ? (
              <PrTab
                worktree={workspace.path ?? null}
                pr={pullRequest.pr}
                refresh={pullRequest.refresh}
                repoId={repo.id}
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
          <div className={`ws-right${stripOpen ? "" : " strip-collapsed"}`}>
            <RightPanel
              diff={diff}
              actions={review.actions}
              pr={pullRequest}
              worktree={workspace.path ?? null}
              review={<ReviewButton onReview={() => void reviews.start()} onEdit={() => void reviews.start(true)} error={reviews.error} />}
              fixErrors={fixErrors}
              readOnly={workspace.status === "archived"}
              notify={notify}
              emptyAction={<PullLatestButton pullLatest={pullLatest} agentWorking={agentWorking} />}
            />
            {/* Until workspaces carry their worktree path, terminals open in the repository checkout. */}
            <PanelStrip repo={repo} workspace={workspace} open={stripOpen} setOpen={setStripOpen} view={stripView} setView={setStripView} cwd={repo.path} />
          </div>
        )}
      </div>
      <DiffDiscardHost diff={diff} onDiscarded={(f) => chatBridge.current?.attach(revertedNote(f.path))} />
      {renamingChat !== null && (
        <RenameChatDialog
          key={renamingChat}
          currentTitle={tabTitle(renamingChat)}
          onRename={(title) => renameChat(renamingChat, title)}
          onClose={() => setRenamingChat(null)}
          onError={(message) => notify?.("error", message)}
        />
      )}
    </div>
  );
}
