import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import { loadReposFromDb, type Action } from "../state/store";
import { LinkedDirectoryPicker } from "../features/chat/LinkedDirectoryPicker.tsx";
import { mutateWorkspaceLinks, type LinkMutation } from "../features/chat/workspaceLinks.ts";
import { ChevronIcon, RightSidebarIcon } from "./Icons";
import { toggleRightPanel } from "./panelPrefs";
import { clearManuallyUnread, markManuallyUnread, readOnView, setSelectedChat, setShownChat } from "../state/autoUnread";
import { isChatUnread } from "../state/chatUnread";
import { chatTabStatus, chatTabUnreadDot } from "../state/chatTabUnread";
import { onChatRequest, takeChatRequest } from "../state/openChat";
import { onGitPanelRequest, takeGitPanelRequest, type GitPanelTarget } from "../palette/gitPanelActions.ts";
import { useWindowFocused } from "../state/useAutoUnread";
import { Transcript } from "../features/chat/Transcript.tsx";
import { configureReason, configureReasonDefault, reasonAvailable, reasonChatConfig, retryReasonAuth } from "../features/chat/reasonChat.ts";
import { isSignInFailure } from "../features/chat/agentSignIn.ts";
import { CHAT_AGENTS, saveAgent, savedAgent, type ChatAgentId } from "../features/chat/agents.ts";
import { chatStatuses, subscribeChatStatuses, type ChatSnapshot, type PermissionPrompt } from "../features/chat/chatRuntime.ts";
import { PermissionRequests, ToolApproval, pendingToolApproval } from "../features/chat/PermissionRequests.tsx";
import { handoffPlan } from "../features/chat/planHandoff.ts";
import { completeTranscript, copiedTranscriptMessage, forkAttachmentName, forkTranscript } from "../features/chat/fork.ts";
import { ChatTabMenu, type ChatTabMenuActions } from "./ChatTabMenu";
import { RenameChatDialog } from "./RenameChatDialog";
import { PrBadgeMenu } from "../features/pr/PrBadgeMenu";
import { inTauri } from "../backend";
import { copyWorkspaceLink } from "../workspace/link";
import { copyText } from "../features/openIn/apps";
import { forkToNewWorkspace } from "../features/chat/forkWorkspace.ts";
import { createWorkspace, ensureRepository } from "../workspace/api";
import { generateWorkspaceNames } from "../workspace/naming";
import { startSetupScript } from "../home/createFirstWorkspace";
import type { ConfigChoice } from "../features/diff/review.ts";
import { Composer } from "../features/chat/Composer.tsx";
import { McpStatusDialog } from "../features/chat/McpStatusDialog.tsx";
import type { ComposerEditorHandle } from "../features/chat/ComposerEditor.tsx";
import { appendComposerText } from "../features/chat/composerDocument.ts";
import { withSentAttachmentDisplay, type UserPrompt } from "../features/chat/userContent.ts";
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
import { copyModelChoice, loadModelChoice, saveModelChoice } from "../features/chat/chatModelChoice.ts";
import { fastModeAvailable, type ModelChoice } from "../features/chat/composerModels.ts";
import { agentForModel } from "../settings/models.ts";
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
import { ChangesToolbar } from "../features/diff/ChangesToolbar.tsx";
import { useChangesPresentation } from "../features/diff/useChangesPresentation.ts";
import { filterActive, filterToggleShown, toggleFilter } from "../features/diff/changesFilter";
import { ancestors } from "../features/files/tree.ts";
import { SearchIcon } from "../features/files/panelIcons";
import { Tooltip } from "./ui/Tooltip.tsx";
import { useWorkspaceDiff, type WorkspaceDiff } from "../features/diff/useWorkspaceDiff";
import { showUncommittedChanges, TARGET_REMOTE, targetBranch } from "../features/diff/target";
import type { DiffScope, FileDiff } from "../features/diff/types";
import { useReviewComments, type ChatBridge } from "../features/diff/ReviewComments";
import { queuePending, ReviewButton, takePendingMessage, useReviewChats, type ReviewTab } from "../features/diff/ReviewButton";
import { clearLocalChat, type LocalChatReplacement } from "../features/chat/localClear.ts";
import { addAttachment, revertedNote, useWorkspaceChatAttach, type ComposerAttach, type TextAttachment } from "../features/diff/chatAttachment";
import { attachmentPath, randomDir, type ComposerAttachment } from "../features/chat/composerAttachments.ts";
import { composerSessionFor } from "../features/chat/composerSession.ts";
import { useLocalPlanMode } from "../features/chat/useLocalPlanMode.ts";
import { terminalOutputFiles, terminalOutputRequest } from "../features/chat/composerTerminal.ts";
import { draftAttachmentsApi } from "../features/draft-attachments/api.ts";

/** Sends a message with attached text files from the chat shown (Fix errors). */
interface AttachedSend {
  sendWith(text: string, attachments: TextAttachment[]): void;
}
/** `forkToTab`: the shown chat's "Fork to new tab", with its composer draft (the tab menu's item). */
type ShownChatBridge = ChatBridge & ComposerAttach & AttachedSend & { focusAtEnd(): void; forkToTab?: () => void };
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { closeTab, getTabs, onCenterTabOpened, openBigTab, subscribeTabs } from "../features/terminal/session";
import { TerminalHost } from "../features/terminal/TerminalPanel";
import { terminalTabs, type TerminalTab } from "../features/terminal/tabs";
import { tabLabel } from "../features/terminal/shellIntegration";
import "../features/terminal/centerTerminal.css";
import { bigTabRequest } from "../features/terminal/bigTerminal";
import { KeybindingScope, useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { PRIORITY } from "../keybindings/dispatcher.ts";
import { PanelStrip, type StripView } from "./PanelStrip";
import { BrowserPreviewAnchor, BrowserPreviewTab } from "../features/browser/BrowserPreview";
import { browserSnapshot, closeBrowserPreview, openBrowserPreview, subscribeBrowser } from "../features/browser/store.ts";
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
import { MarkdownFileView } from "../features/files/MarkdownFileView";
import { isMarkdownFile } from "../features/files/fileView";
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
import { useFollowUpMode } from "../settings/useFollowUpMode";
import { OpenInButton } from "../features/openIn/OpenInButton";
import { RepoHeaderMenu } from "./RepoHeaderMenu";
import { WorkspaceBranchHeader } from "./WorkspaceBranchHeader";
import { WorkspaceNameHeader } from "./WorkspaceNameHeader";
import type { NavSection } from "../state/navigationSections";
import { SETUP_SCRIPT_PROMPT } from "../scripts/setupPrompt";

interface Props {
  repo: Repo;
  workspace: Workspace;
  dispatch: Dispatch<Action>;
  notify?: ArchiveNotify;
  /** Opens the next unread chat (the composer's "Next unread" button). */
  onNextUnread?: () => void;
  /** Whether a chat other than `selectedChatId` is unread: the button shows only then. */
  hasNextUnread?: (selectedChatId: string) => boolean;
}

interface WorkspaceViewProps extends Props {
  sections: readonly NavSection[];
  onNewSection: (workspace: Workspace) => void;
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

/** Queues the Create-workspace dialog's first message for the new workspace's chat. */
export function seedTranscript(workspaceId: string, text: string) {
  firstPrompts.set(workspaceId, text);
}

interface ChatPanelProps extends Props {
  /** The workspace id for the workspace's own chat, or a review chat's id. */
  chatId: string;
  onClearLocal: (sourceId: string, replacement: LocalChatReplacement) => void;
  /** Set for a review chat. */
  review?: ReviewTab;
  bridge: MutableRefObject<ShownChatBridge | null>;
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

function ChatPanel({ repo, workspace, dispatch, notify, chatId, review, bridge, content, onRunningChange, openTurnFile, openFile, onNextUnread, forkToNewTab, chatTabs, onClearLocal }: ChatPanelProps) {
  const reason = reasonAvailable();
  const cwd = workspace.path ?? repo.path;
  const [linkRepos, setLinkRepos] = useState<Repo[] | null>(null);
  const linkRequest = useRef(0);
  useEffect(() => {
    linkRequest.current++;
    setLinkRepos(null);
    return () => { linkRequest.current++; };
  }, [workspace.id]);
  const linkWorkspace = linkRepos?.flatMap((r) => r.workspaces).find((w) => w.id === workspace.id);
  async function openLinks() {
    const request = ++linkRequest.current;
    try {
      const repos = await loadReposFromDb();
      if (request === linkRequest.current) setLinkRepos(repos);
    } catch (e) { if (request === linkRequest.current) setAttachError(String(e)); }
  }
  async function mutateLink(mutation: LinkMutation) {
    const request = linkRequest.current;
    await invoke("workspace_set_link", { ...mutation });
    const repos = await loadReposFromDb();
    if (request === linkRequest.current) setLinkRepos(repos);
    dispatch({ type: "hydrate", repos });
  }
  const main = chatId === (workspace.primaryChatId ?? workspace.id);
  const clearing = useRef(false);
  const [picked, setPicked] = useState<Record<string, ChatAgentId>>({});
  const agentId: ChatAgentId = reason ? (picked[chatId] ?? savedAgent(chatId)) : "reason";
  const [modelChoices, setModelChoices] = useState<Record<string, ModelChoice>>({});
  const modelChoice = modelChoices[chatId] ?? loadModelChoice(chatId);
  function pickModel(next: ModelChoice) {
    saveModelChoice(chatId, next);
    setModelChoices((choices) => ({ ...choices, [chatId]: next }));
  }
  const fastMode = agentId !== "reason" && modelChoice?.agent === agentId && agentForModel(modelChoice.model) === agentId && fastModeAvailable(modelChoice.model)
    ? { isFastMode: !!modelChoice.fast }
    : undefined;
  const agent = CHAT_AGENTS[agentId];
  const codex = agentId === "codex";
  // The "/" menu: Conductor's built-ins for the agent, then the commands and
  // skills the agent reports for this folder (agent_commands backend).
  const reported = useAgentCommands(agentId, cwd);
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
  const session = useMemo(() => composerSessionFor(chatId, composerDrafts()), [chatId]);
  const { draft, attachments, error: attachError } = useSyncExternalStore(session.subscribe, session.snapshot);
  const { setDraft, setAttachments } = session;
  const setAttachError = session.setError;
  useEffect(() => {
    void session.connect();
    return () => session.disconnect();
  }, [session]);
  /** The turn whose "Reset chat?" dialog is open. */
  const [resetTurn, setResetTurn] = useState<string | null>(null);
  /** A "Fork to new tab" is reading the chat's options. */
  const [forking, setForking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ComposerEditorHandle>(null);
  const [mcpStatusChat, setMcpStatusChat] = useState<string | null>(null);
  useEffect(() => setMcpStatusChat(null), [chatId, agentId]);
  const running = transcript.activeTurn !== null;
  const planMode = useLocalPlanMode(chatId, workspace.id, agentId === "claude", workspace.status === "archived" || running || queue.status !== "idle" || queue.items.length > 0 || permissions.length > 0, setAttachError);
  const slashCommands = useMemo(
    () => commandSet({ agent: COMPOSER_AGENT[agentId], planMode, fastMode, agentCommands: reported?.slashCommands, skills: reported?.skills }),
    [agentId, reported, planMode?.isPlanMode, fastMode?.isFastMode],
  );
  useKeybindings({ "chat.togglePlanMode": planMode ? () => planMode.onToggle() : undefined });
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
    if (pendingMessage?.kind === "send") submit({ text: pendingMessage.text }, "queue", pendingMessage.attachments);
    const first = main ? firstPrompts.get(workspace.id) : undefined;
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      agent.submit(runId, cwd, { text: first }, "queue", [], repo.path || undefined, workspace.id);
    }
    return unsubscribe;
  }, [chatId, agentId]);

  function pickAgent(next: ChatAgentId) {
    saveAgent(chatId, next);
    setPicked((p) => ({ ...p, [chatId]: next }));
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript, waiting]);

  // Attachments (a review request, revert notes) go to the agent with the message and show by name.
  function submit(input: UserPrompt, mode: SendMode, attached: readonly TextAttachment[] = []) {
    const { text } = input;
    if (!text.trim() && attached.length === 0) return;
    const first = main && !agent.snapshot(runId).transcript.messages.some((m) => m.role === "user");
    agent.submit(runId, cwd, input, mode, attached, repo.path || undefined, workspace.id);
    dispatch({ type: "touchWorkspace", repoId: repo.id, workspaceId: workspace.id, at: Date.now() });
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  async function answerClaudePlan(requestId: string, text = session.snapshot().draft) {
    const pending = agent.snapshot(runId).permissions[0];
    if (pending?.kind !== "plan" || pending.requestId !== requestId || !agent.answerPermission) return;
    const feedback = text.trim();
    if (feedback && !session.readyToSend()) return;
    const submittedDraft = session.snapshot().draft;
    setAttachError(null);
    try {
      await agent.answerPermission(runId, requestId, feedback ? { kind: "plan", approved: false, feedback } : { kind: "plan", approved: true });
      if (feedback && session.snapshot().draft === submittedDraft) setDraft("");
    } catch (error) {
      setAttachError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handoffPlanToTab(requestId: string, plan: string) {
    const config = agentId === "reason" ? defaultChatConfig(await getSettings()) : [];
    const answer = agent.answerPermission;
    if (!answer) throw new Error("This agent cannot answer plan requests.");
    await handoffPlan({
      plan,
      attachmentPath: attachmentPath("plan.md", randomDir()),
      isPending: () => agent.snapshot(runId).permissions.some((p) => p.kind === "plan" && p.requestId === requestId),
      stage: async (attachment) => {
        await draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath: attachment.name, data: new TextEncoder().encode(attachment.text) });
      },
      openDraft: (draft) => {
        const id = forkToNewTab("Implement plan", config, draft);
        saveAgent(id, agentId);
      },
      reject: () => answer(runId, requestId, { kind: "plan", approved: false }),
      stop: () => agent.stop(runId),
    }).catch((error: unknown) => {
      notify?.("error", `Failed to hand off plan: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    });
  }

  /**
   * Conductor's "Fork to new tab" (`y9t`): a new tab in this workspace on this
   * chat's options, with the conversation up to `turnId` (all of it when
   * omitted, as ⌥⌘↩ forks) attached as "Transcript of <title>.md" and this
   * composer's text copied. Not sent.
   */
  async function forkToTab(turnId?: string) {
    setAttachError(null);
    const markdown = forkTranscript(transcript, turnId);
    if (markdown === null) {
      setAttachError("Unable to fork chat to new tab: failed to generate chat transcript");
      return;
    }
    setForking(true);
    try {
      // Only Reason chats carry options; a fork of a Codex or Claude Code chat keeps its agent.
      const config = agentId === "reason" ? await reasonChatConfig(chatId) : [];
      const title = review?.title ?? workspace.chatTitle ?? workspace.name;
      const id = forkToNewTab(`Fork of ${title}`, config, { text: draft, attachments: [{ name: forkAttachmentName(title), text: markdown }] });
      if (agentId !== "reason") saveAgent(id, agentId);
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
      copyModelChoice(chatId, id, agentId, config);
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
  async function copyConciseTranscript() {
    const text = forkTranscript(transcript);
    if (!text?.trim()) return notify?.("info", "No chat content to copy");
    try {
      await navigator.clipboard.writeText(text);
      notify?.("info", copiedTranscriptMessage("concise", review?.title ?? workspace.chatTitle ?? workspace.name));
    } catch {
      notify?.("error", "Failed to copy concise transcript");
    }
  }

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
      setDraft((d) => appendComposerText(d, text));
      inputRef.current?.focus();
    },
    send: (text) => submit({ text }, "queue"),
    sendWith: (text, attached) => submit({ text }, "queue", attached),
    attach: (a) => setAttachments((list) => addAttachment(list, a)),
    focusAtEnd: () => inputRef.current?.focus("end"),
    forkToTab: () => {
      if (!forking) void forkToTab();
    },
  };

  /** Stages each file (Conductor's draft attachments); it reaches the workspace when the message is sent. */
  async function attachFiles(files: File[]) {
    await session.attach(files, reason ? (relativePath, data) => draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data }) : undefined);
  }

  async function attachTerminalOutput() {
    await session.attach(
      () => invoke<unknown>("get_terminal_output", { request: terminalOutputRequest(workspace.id, getTabs(workspace.id)) }).then((output) => terminalOutputFiles(output)),
      reason ? (relativePath, data) => draftAttachmentsApi.write({ draftWorkspaceId: workspace.id, relativePath, data }) : undefined,
    );
  }

  function removeAttachment(a: ComposerAttachment) {
    if (session.sending) return;
    setAttachments((list) => list.filter((x) => x.name !== a.name));
    if (a.staged) draftAttachmentsApi.remove({ localWorkspaceId: workspace.id, relativePath: a.staged }).catch((e) => console.warn("chat: staged attachment not removed", e));
  }

  /** Copies every staged file before delivering any part of the message. */
  async function onSubmit(input: UserPrompt, mode: SendMode) {
    const copiedPaths = new Set<string>();
    await session.send(
      async (relativePath) => {
        await draftAttachmentsApi.uploadToWorkspace({ localWorkspaceId: workspace.id, relativePath, workspacePath: cwd });
        copiedPaths.add(relativePath);
      },
      (sending) => submit(withSentAttachmentDisplay(input, sending, copiedPaths), mode, sending.map(({ name, text }) => ({ name, text }))),
    );
  }

  return (
    <section className="chat" aria-label="Chat">
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
              const attachment: ComposerAttachment = { name: `session-transcript-${c.chatId}.md`, label: forkAttachmentName(c.title), text };
              setAttachments((list) => addAttachment(list, attachment));
            }}
          />
        ) : null}
          <Transcript
            transcript={transcript}
            searchEnabled={content === null}
            notify={notify}
            expandToolsByDefault={garryMode}
            dontCollapseToolCalls={garryMode}
            onRetry={(prompt, turnId) => {
              if (agentId === "reason" && isSignInFailure("reason", transcript.turns[turnId]?.error)) retryReasonAuth(runId, cwd, prompt, turnId);
              else submit(prompt, "queue");
            }}
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
            turnAgent={agent.label}
            chatAgent={agentId}
          />
        <div ref={endRef} />
      </div>
      {resetTurn !== null ? (
        <ResetChatDialog
          loadChangedCount={() => changedSinceTurn(invoke, cwd, runId, resetTurn)}
          onConfirm={(resetFiles) => (agent.reset ? agent.reset(runId, cwd, resetTurn, resetFiles) : Promise.resolve())}
          onClose={() => setResetTurn(null)}
        />
      ) : null}
      <PermissionRequests permissions={permissions} onAnswer={(requestId, answer) => {
        if (agentId === "claude" && answer.kind === "plan" && answer.approved) void answerClaudePlan(requestId);
        else void agent.answerPermission?.(runId, requestId, answer);
      }} onStop={() => agent.stop(runId)} onHandoffPlan={handoffPlanToTab} />
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
      {linkRepos ? <LinkedDirectoryPicker
        key={workspace.id}
        repos={linkRepos}
        repositoryId={repo.id}
        excludedPaths={[cwd]}
        linkedWorkspaceIds={linkWorkspace?.linkedWorkspaceIds}
        linkedDirectoryPaths={linkWorkspace?.linkedDirectoryPaths}
        onChoose={(selection) => mutateWorkspaceLinks({ workspaceId: workspace.id, selection, linkedWorkspaceIds: linkWorkspace?.linkedWorkspaceIds ?? [], mutate: mutateLink })}
        onRemoveDirectory={(path) => mutateLink({ workspaceId: workspace.id, kind: "directory", value: path, linked: false })}
        onClose={() => { linkRequest.current++; setLinkRepos(null); }}
      /> : null}
      {agentId === "codex" && mcpStatusChat === chatId ? <McpStatusDialog key={chatId} chatId={chatId} onClose={() => setMcpStatusChat(null)} /> : null}
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
        key={chatId}
        draft={draft}
        clearOnSubmit={planWaiting !== undefined}
        setDraft={setDraft}
        inputRef={inputRef}
        workspacePath={cwd}
        hasAttachments={!planWaiting && attachments.length > 0}
        // Conductor: while a plan waits, the message box asks for changes to it; otherwise its own placeholders.
        placeholder={planWaiting ? "Enter your plan adjustments here..." : undefined}
        queue={queue}
        canSteer={agent.canSteer}
        followUpMode={followUpMode}
        onSubmit={planWaiting ? (input) => {
          if (agentId === "claude") return answerClaudePlan(planWaiting.requestId, input.text);
          else void agent.answerPermission?.(runId, planWaiting.requestId, { kind: "plan", approved: false, feedback: input.text });
        } : onSubmit}
        onStop={() => agent.stop(runId)}
        onQueue={(action) => agent.queueAction(runId, action)}
        onAttachFiles={(files) => void attachFiles(files)}
        onLinkWorkspaces={() => void openLinks()}
        onMcpStatus={agentId === "codex" ? () => setMcpStatusChat(chatId) : undefined}
        onAttachTerminalOutput={() => void attachTerminalOutput()}
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
            <ChatModelPicker chatId={chatId} agent={agentId} selection={{ value: modelChoice, onChange: pickModel }} onAgentChange={reason && queue.status === "idle" && queue.items.length === 0 && (agentId !== "claude" || (planMode && !planMode.isPlanMode && !planMode.disabled)) ? pickAgent : undefined} />
          )
        }
        planMode={planMode}
        slashCommands={slashCommands}
        onCommand={(text) => {
          // Agent commands and skills shadow the built-ins.
          const cmd = parseSlashCommand(text, isKnownCommand);
          if (!cmd || slashCommands.some((c) => c.name === cmd.name && (c.effect === "agent" || c.effect === "skill"))) return false;
          if (slashCommands.some((c) => c.name === cmd.name && c.effect === "pick_linked_directory")) { void openLinks(); return true; }
          if (agentId === "codex" && slashCommands.some((c) => c.name === cmd.name && c.effect === "show_mcp_status")) { setMcpStatusChat(chatId); return true; }
          if (cmd.name === "plan" && planMode) {
            if (planMode.disabled) setAttachError("Wait for the current Claude Code turn to end before changing Plan mode.");
            else planMode.onToggle();
            return true;
          }
          if (cmd.name === "fast" && fastMode && modelChoice) {
            pickModel({ ...modelChoice, fast: !fastMode.isFastMode });
            return true;
          }
          if (cmd.name === "clear" && (agentId === "claude" || agentId === "codex")) {
            if (clearing.current) return true;
            if (workspace.status === "archived" || running || queue.status !== "idle" || queue.items.length > 0 || permissions.length > 0 || approvals.length > 0 || consents.length > 0) {
              setAttachError("Only an idle local chat can be cleared.");
              return true;
            }
            clearing.current = true;
            void clearLocalChat(workspace.id, chatId, agentId)
              .then((replacement) => onClearLocal(chatId, replacement))
              .catch((error: unknown) => setAttachError(error instanceof Error ? error.message : String(error)))
              .finally(() => { clearing.current = false; });
            return true;
          }
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
  workspaceId: string;
  tab: GitPanelTarget["tab"];
  setTab: (tab: GitPanelTarget["tab"]) => void;
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
  targetControl?: ReactNode;
  activeFilePath?: string;
}

function RightPanel({ workspaceId, tab, setTab, diff, actions, pr, worktree, review, fixErrors, readOnly, notify, emptyAction, targetControl, activeFilePath, onOpenFile }: RightPanelProps & { onOpenFile: (path: string) => boolean }) {
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
  const { presentation, ready: presentationReady, update: updatePresentation } = useChangesPresentation(workspaceId);
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => setFilterOpen(false), [workspaceId]);
  const revealedFile = useRef<{ workspaceId: string; path: string } | null>(null);
  useEffect(() => {
    if (tab !== "changes" || presentation.diffFileListMode !== "tree") {
      revealedFile.current = null;
      return;
    }
    if (!activeFilePath || (revealedFile.current?.workspaceId === workspaceId && revealedFile.current.path === activeFilePath)) return;
    revealedFile.current = { workspaceId, path: activeFilePath };
    const parents = new Set(ancestors(activeFilePath));
    if (!presentation.collapsedDirectoryPaths.some((path) => parents.has(path))) return;
    updatePresentation((previous) => ({
      collapsedDirectoryPaths: previous.collapsedDirectoryPaths.filter((path) => !parents.has(path)),
    }));
  }, [workspaceId, tab, activeFilePath, presentation.diffFileListMode, presentation.collapsedDirectoryPaths, updatePresentation]);
  const filterOn = filterActive(filterOpen, presentation.filePathFilter);
  const filter = {
    open: filterOpen,
    query: presentation.filePathFilter,
    setQuery: (query: string) => updatePresentation({ filePathFilter: query }),
    close: () => { setFilterOpen(false); updatePresentation({ filePathFilter: "" }); },
  };
  const toggleDirectory = (path: string) => updatePresentation((previous) => ({
    collapsedDirectoryPaths: previous.collapsedDirectoryPaths.includes(path) ? previous.collapsedDirectoryPaths.filter((entry) => entry !== path) : [...previous.collapsedDirectoryPaths, path],
  }));
  const tabButton = (id: typeof tab, label: ReactNode) => (
    <button type="button" role="tab" aria-selected={tab === id} className={`rp-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
      {label}
    </button>
  );
  return (
    <section className="diff" aria-label="Changes">
      {/* Conductor's right panel: All files, Changes N, Checks, then the tab's own icons at the right end. */}
      <div className="rp-tabs" role="tablist">
        <div className="rp-tab-buttons">
          {tabButton("files", "All files")}
          {tabButton("changes", <>Changes {count ? <span className="tab-count">{count}</span> : null}</>)}
          {tabButton("checks", <>Checks {checksStatus ? <span className={`checks-dot ${checksStatus}`} aria-label={checksStatus} /> : null}</>)}
        </div>
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
                onClick={() => { const next = toggleFilter(filterOpen, presentation.filePathFilter); setFilterOpen(next.open); updatePresentation({ filePathFilter: next.query }); }}
              >
                <SearchIcon size={12} />
              </button>
            </Tooltip>
          )}
          {tab === "changes" && <ChangesToolbar diff={diff} view={presentation.diffFileListMode} onViewChange={(view) => updatePresentation({ diffFileListMode: view })} targetControl={targetControl} />}
        </span>
      </div>
      {tab === "changes" ? (
        <ChangesList diff={diff} actions={actions} worktree={worktree} activeFilePath={presentationReady ? activeFilePath : undefined} emptyAction={emptyAction} filter={filter} notify={notify} view={presentation.diffFileListMode} collapsed={new Set(presentation.collapsedDirectoryPaths)} toggleDirectory={toggleDirectory} />
      ) : tab === "checks" ? (
        <ChecksTab
          worktree={worktree}
          pr={pr.pr}
          refresh={pr.refresh}
          fixErrors={fixErrors}
          readOnly={readOnly}
        />
      ) : (
        <AllFilesTree worktree={worktree} notify={notify} toolbar={files} onOpenFile={onOpenFile} />
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
  terminals: TerminalTab[];
  onCloseTerminal: (id: string) => void;
  onSelect: (t: MainTab) => void;
  onCloseDiff: () => void;
  onCloseReview: (chatId: string) => void;
  /** The workspace's own chat id (its tab is "chat"). */
  mainChatId: string;
  isUnread: (chatId: string) => boolean;
  /** The chat tab menu's "Mark as read" / "Mark as unread". */
  onToggleRead: (chatId: string) => void;
  /** The rest of the chat tab menu, for the tab right-clicked (`title` is its tab's). */
  chatMenu: (chatId: string, title: string) => Omit<ChatTabMenuActions, "toggleRead">;
  /** The "+" after the chat tabs (NewChatButton). */
  newChat: ReactNode;
  fileTab: ReactNode;
  browserTab?: ReactNode;
}

function MainTabs({ title, active, diffOpen, prTab, onClosePr, reviews, terminals, onCloseTerminal, onSelect, onCloseDiff, onCloseReview, mainChatId, isUnread, onToggleRead, chatMenu, newChat, fileTab, browserTab }: MainTabsProps) {
  const [menu, setMenu] = useState<{ chatId: string; title: string; x: number; y: number } | null>(null);
  const openMenu = (chatId: string, tabTitle: string) => (e: ReactMouseEvent) => {
    e.preventDefault();
    setMenu({ chatId, title: tabTitle, x: e.clientX, y: e.clientY });
  };
  const statuses = useSyncExternalStore(subscribeChatStatuses, chatStatuses);
  // Conductor's l8i before the chat tab's title: an 8px --unread dot while the chat is unread and idle.
  const unreadDot = (chatId: string) => (chatTabUnreadDot(isUnread(chatId), chatTabStatus(statuses, chatId)) ? <ChatTabUnreadDot /> : null);
  return (
    <div className="tabs main-tabs" role="tablist" aria-label="Workspace tabs">
      {menu && <ChatTabMenu at={menu} unread={isUnread(menu.chatId)} actions={{ toggleRead: () => onToggleRead(menu.chatId), ...chatMenu(menu.chatId, menu.title) }} onClose={() => setMenu(null)} />}
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
        <button role="tab" aria-selected={active === "chat"} className={active === "chat" ? "active" : ""} onClick={() => onSelect("chat")} onContextMenu={openMenu(mainChatId, title)} data-unread={isUnread(mainChatId) || undefined}>
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
          <button role="tab" aria-selected={active === r.chatId} className={active === r.chatId ? "active" : ""} onClick={() => onSelect(r.chatId)} onContextMenu={openMenu(r.chatId, r.title)} data-unread={isUnread(r.chatId) || undefined} title={r.fork || r.blank ? r.title : `Code review on ${r.modelLabel}`}>
            {unreadDot(r.chatId)}
            {r.title}
          </button>
          <button className="main-tab-close" onClick={() => onCloseReview(r.chatId)} aria-label={`Close ${r.title} tab`}>
            ×
          </button>
        </span>
      ))}
      {terminals.map((terminal, index) => {
        const id = `terminal:${terminal.id}`;
        const label = tabLabel(terminals.length === 1 ? "Terminal" : `Terminal ${index + 1}`, terminal.runningProgram);
        return (
          <span key={id} className={`main-tab${active === id ? " active" : ""}`}>
            <button role="tab" aria-selected={active === id} className={active === id ? "active" : ""} onClick={() => onSelect(id)}>{label}</button>
            <button className="main-tab-close" onClick={() => onCloseTerminal(terminal.id)} aria-label={`Close ${label} tab`}>×</button>
          </span>
        );
      })}
      {fileTab}
      {browserTab}
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

/** "→ <target>" in the workspace header: the target branch picker (Conductor's `sxi`). */
function TargetChip({ target, open, setOpen, repo, variant = "header" }: { target: TargetBranch; open: boolean; setOpen: (v: boolean) => void; repo: Repo; variant?: "header" | "menu" }) {
  const disabled = target.disabledReason !== null || target.changing;
  return (
    <span className="pr-base-anchor target-chip">
      <button
        className={variant === "menu" ? "oc-changes-target-trigger" : "chip"}
        disabled={disabled}
        aria-label={`Target branch ${target.branch}`}
        title={target.disabledReason ?? target.error ?? "Target branch"}
        onClick={() => setOpen(!open)}
      >
        {variant === "menu" ? <>{TARGET_REMOTE}/{target.branch}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m8 9 4-4 4 4m-8 6 4 4 4-4" /></svg></> : <>→ {target.branch}</>}
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

export function WorkspaceView({ repo, workspace, sections, dispatch, notify, onNewSection, onNextUnread, hasNextUnread }: WorkspaceViewProps) {
  const primaryId = workspace.primaryChatId ?? workspace.id;
  // The right panel's Setup / Run / Terminal strip: open on Run, like Conductor.
  // ⌘J hides or shows the right panel; Big terminals live in the center.
  const [stripOpen, setStripOpen] = useState(true);
  const [stripView, setStripView] = useState<StripView>("run");
  useEffect(() => setStripView("run"), [workspace.id]);
  const chatBridge = useRef<ShownChatBridge | null>(null);
  const settingUp = useCreateSetupRunning(workspace.id);
  // The "All changes" tab opens when a file is picked in the changes list, and is reused for every file.
  const [diffOpen, setDiffOpen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(() => tabOfChat(primaryId, workspace.activeSessionId));
  const browserPage = useSyncExternalStore(subscribeBrowser, () => browserSnapshot().pages.get(workspace.id));
  const displayedWorkspace = useRef(workspace.id);
  displayedWorkspace.current = workspace.id;
  const openPreview = useCallback((workspaceId: string, url: string) => {
    if (!openBrowserPreview(workspaceId, url)) return false;
    if (displayedWorkspace.current === workspaceId) setMainTab("browser");
    return true;
  }, []);
  const closeBrowser = () => { closeBrowserPreview(workspace.id); setMainTab("chat"); };
  const terminals = useSyncExternalStore(subscribeTabs, () => getTabs(workspace.id));
  const centerTerminals = terminalTabs(terminals, "center");
  const centerTerminal = centerTerminals.find((tab) => `terminal:${tab.id}` === mainTab);
  useEffect(() => onCenterTabOpened((workspaceId, id) => {
    if (workspaceId === workspace.id) setMainTab(`terminal:${id}`);
  }), [workspace.id]);
  useEffect(() => {
    if (mainTab.startsWith("terminal:") && !centerTerminal) setMainTab("chat");
  }, [mainTab, centerTerminal]);
  const [fileTarget, setFileTarget] = useState<{ path: string; workspaceId: string } | null>(null);
  useEffect(() => setFileTarget(null), [workspace.id]);
  const openMarkdown = (path: string) => {
    if (!workspace.path || !isMarkdownFile(path)) return false;
    setFileTarget({ path, workspaceId: workspace.id });
    setMainTab("file");
    return true;
  };
  const closeFile = () => { setFileTarget(null); setMainTab("chat"); };
  const [prOpen, setPrOpen] = useState(false);
  const [pickingTarget, setPickingTarget] = useState(false);
  const [pickingChangesTarget, setPickingChangesTarget] = useState(false);
  useEffect(() => {
    setDiffOpen(false);
    setPrOpen(false);
    setPickingTarget(false);
    setPickingChangesTarget(false);
    // Go to next unread or a row click may have asked for one of its chats (state/openChat.ts).
    setMainTab(tabOfChat(primaryId, takeChatRequest(workspace.id) ?? workspace.activeSessionId));
    return onChatRequest((id) => {
      if (id === workspace.id) setMainTab(tabOfChat(primaryId, takeChatRequest(workspace.id)));
    });
  }, [workspace.id, primaryId]);
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
  const [gitPanelTab, setGitPanelTab] = useState<GitPanelTarget["tab"]>("changes");
  // Keep the tab while RightPanel is hidden; picking a turn still opens its changes list.
  useEffect(() => {
    if (diff.turn) setGitPanelTab("changes");
  }, [diff.turn]);
  useEffect(() => {
    const applyGitPanelRequest = () => {
      const request = takeGitPanelRequest(repo.id, workspace.id);
      if (!request) return;
      setGitPanelTab(request.tab);
      if ("scope" in request) diff.update({ scope: request.scope });
    };
    const unsubscribe = onGitPanelRequest((repoId, workspaceId) => {
      if (repoId === repo.id && workspaceId === workspace.id) applyGitPanelRequest();
    });
    applyGitPanelRequest();
    return unsubscribe;
  }, [repo.id, workspace.id, diff]);
  // Inserts go to the chat shown; sends (e.g. Create PR) go to the workspace's own chat, switching to it.
  const shownChat = useRef<string>(workspace.id);
  const addTerminalSelection = useCallback((sessionId: string, text: string): boolean => {
    if (displayedWorkspace.current !== workspace.id || shownChat.current !== sessionId || !chatBridge.current) return false;
    chatBridge.current.attach({ name: `terminal-selection-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5)}.txt`, text });
    setMainTab(tabOfChat(primaryId, sessionId));
    requestAnimationFrame(() => {
      if (displayedWorkspace.current === workspace.id && shownChat.current === sessionId) chatBridge.current?.focusAtEnd();
    });
    return true;
  }, [workspace.id, primaryId]);
  // Review comments attach to the workspace's own chat, even while a review chat is shown.
  const attach = useWorkspaceChatAttach(primaryId, shownChat, chatBridge, useCallback(() => setMainTab("chat"), []));
  const chat = useMemo<ChatBridge & ComposerAttach>(
    () => ({
      attach,
      insert: (t) => chatBridge.current?.insert(t),
      send: (t) => {
        if (shownChat.current === primaryId) return chatBridge.current?.send(t);
        queuePending(primaryId, { kind: "send", text: t, attachments: [] });
        setMainTab("chat");
      },
    }),
    [primaryId, attach],
  );
  // Fix errors goes to the workspace's own chat with its log files attached, and shows that chat.
  const sendToChat = useCallback(
    (text: string, attachments: TextAttachment[]) => {
      if (shownChat.current === primaryId && chatBridge.current) chatBridge.current.sendWith(text, attachments);
      else queuePending(primaryId, { kind: "send", text, attachments });
      setMainTab("chat");
    },
    [primaryId],
  );
  // The Setup tab's "Ask agent" (Conductor's `Jo`): the setup-script prompt goes to the workspace's chat.
  const askSetupAgent = useCallback(() => chat.send(SETUP_SCRIPT_PROMPT), [chat]);
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
  const tabOrder = [...(diffOpen ? ["diff"] : []), "chat", ...(prOpen ? ["pr"] : []), ...reviews.tabs.map((r) => r.chatId), ...centerTerminals.map((t) => `terminal:${t.id}`)];
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
        const cwd = workspace.path ?? repo.path;
        if (!big || !cwd) return false;
        void openBigTab(workspace.id, cwd, big).catch((error) => notify?.("error", String(error)));
        return true;
      },
    },
    { enableOnTerminalFocus: false },
  );
  const showDiff = diffOpen && mainTab === "diff";
  const showPr = prOpen && mainTab === "pr";
  const activeReview = reviews.tabs.find((r) => r.chatId === mainTab);
  const showFile = mainTab === "file" && fileTarget !== null && fileTarget.workspaceId === workspace.id && workspace.path !== undefined;
  const showBrowser = mainTab === "browser" && browserPage !== undefined;
  const activeTab = showBrowser ? "browser" : showFile ? "file" : centerTerminal ? `terminal:${centerTerminal.id}` : showDiff ? "diff" : showPr ? "pr" : (activeReview?.chatId ?? "chat");
  const lastDiffSession = useRef({ workspaceId: workspace.id, tab: "chat" });
  if (mainTab === "chat" || activeReview) lastDiffSession.current = { workspaceId: workspace.id, tab: mainTab };
  const activeDiffOwner = useRef({ workspaceId: workspace.id, tab: mainTab });
  activeDiffOwner.current = { workspaceId: workspace.id, tab: mainTab };
  const autoCloseDiffTab = useCallback(() => {
    if (activeDiffOwner.current.workspaceId !== workspace.id || activeDiffOwner.current.tab !== "diff") return;
    const previous = lastDiffSession.current;
    const tab = previous.workspaceId === workspace.id && reviews.tabs.some((review) => review.chatId === previous.tab) ? previous.tab : "chat";
    setDiffOpen(false);
    setMainTab((current) => current === "diff" ? tab : current);
  }, [workspace.id, reviews.tabs]);
  const prNumber = pullRequest.pr?.number ?? null;
  const [prMenu, setPrMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (activeTab !== "browser" && activeTab !== "diff" && activeTab !== "pr" && activeTab !== "file" && !activeTab.startsWith("terminal:")) recordViewedChat(workspace.id, activeTab);
  }, [workspace.id, activeTab]);
  // ⌘W closes the tab on screen and ⌘⇧T reopens the last closed one, as Conductor's workspace
  // view does. The workspace's own chat has no close button here, so ⌘W leaves it. Inside a
  // terminal ⌘W is terminal.closeTab, which the terminal handles itself (session.ts).
  useKeybindings(
    {
      "nav.closeTab": () => {
        if (activeTab === "browser") closeBrowser();
        else if (activeTab === "file") closeFile();
        else if (activeTab === "diff") closeDiffTab();
        else if (activeTab === "pr") closePrTab();
        else if (centerTerminal) closeTab(workspace.id, centerTerminal.id);
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
  shownChat.current = activeReview?.chatId ?? primaryId;
  // The chat whose transcript is on screen (none while the diff or PR tab is open): auto-unread
  // skips it while the window has focus, and an unread workspace shown that way is read.
  const transcriptShown = showBrowser || showDiff || showPr || centerTerminal || showFile ? null : shownChat.current;
  const focused = useWindowFocused();
  useEffect(() => {
    setShownChat(transcriptShown);
    return () => setShownChat(null);
  }, [transcriptShown]);
  useEffect(() => {
    if (inTauri() && transcriptShown) void invoke("db_select_chat", { workspaceId: workspace.id, chatId: transcriptShown }).catch((error: unknown) => console.error("conductor.db: select chat failed", error));
  }, [workspace.id, transcriptShown]);
  // The selected chat tab (Conductor's selectedSessionId): the row menu's "Mark as unread" marks it.
  const selectedChat = shownChat.current;
  useEffect(() => {
    setSelectedChat(centerTerminal || showBrowser ? null : selectedChat);
    return () => setSelectedChat(null);
  }, [selectedChat, centerTerminal, showBrowser]);
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
  // The rest of a chat tab's right-click menu (Conductor's `u8i`, ChatTabMenu.tsx).
  const [renaming, setRenaming] = useState<{ chatId: string; title: string } | null>(null);
  const forkTabEnabled = useBoolPref("experimental_fork_to_new_tab");
  const archived = workspace.status === "archived";
  const chatTranscript = (chatId: string) => agentSnapshot(reasonAvailable() ? savedAgent(chatId) : "reason", chatId).transcript;
  /** "Copy concise transcript" / "Copy full transcript" of one chat tab (Conductor's `U`). */
  const copyChatTranscript = async (chatId: string, title: string, kind: "concise" | "complete") => {
    const transcript = chatTranscript(chatId);
    const text = kind === "concise" ? forkTranscript(transcript) : completeTranscript(transcript);
    if (!text?.trim()) return notify?.("info", "No chat content to copy");
    try {
      await copyText(text);
      notify?.("info", copiedTranscriptMessage(kind, title));
    } catch {
      notify?.("error", `Failed to copy ${kind} transcript`);
    }
  };
  /** "Fork to new tab" on a tab that is not shown: its whole conversation, no draft to carry. */
  const forkChatTab = async (chatId: string, title: string) => {
    const agentId: ChatAgentId = reasonAvailable() ? savedAgent(chatId) : "reason";
    const markdown = forkTranscript(chatTranscript(chatId));
    if (markdown === null) return notify?.("error", "Unable to fork chat to new tab: failed to generate chat transcript");
    try {
      const config = agentId === "reason" ? await reasonChatConfig(chatId) : [];
      const id = reviews.fork(`Fork of ${title}`, config, { text: "", attachments: [{ name: forkAttachmentName(title), text: markdown }] });
      if (agentId !== "reason") saveAgent(id, agentId);
    } catch (e) {
      notify?.("error", e instanceof Error ? e.message : "Failed to fork chat to new tab");
    }
  };
  /** "Close others": every other closable chat tab; the right-clicked one shows (Conductor's `H`). */
  const closeOtherChats = (chatId: string) => {
    for (const r of reviews.tabs) if (r.chatId !== chatId) closeReview(r.chatId);
    setMainTab(tabOfChat(primaryId, chatId));
  };
  /** "Rename chat": a review, fork or "+" tab keeps its title with the tab; the main chat in its session row. */
  const renameChat = async (chatId: string, title: string) => {
    if (chatId !== primaryId) return reviews.rename(chatId, title);
    if (inTauri()) await invoke("db_open_chat_tab", { chatId, workspaceId: workspace.id, title });
    dispatch({ type: "setChatTitle", repoId: repo.id, workspaceId: workspace.id, title });
  };
  const chatMenu = (chatId: string, title: string): Omit<ChatTabMenuActions, "toggleRead"> => {
    const closable = chatId !== primaryId;
    return {
      rename: archived ? undefined : () => setRenaming({ chatId, title }),
      fork:
        forkTabEnabled && !archived
          ? () => (chatId === shownChat.current && transcriptShown !== null ? chatBridge.current?.forkToTab?.() : void forkChatTab(chatId, title))
          : undefined,
      copyConcise: () => void copyChatTranscript(chatId, title, "concise"),
      copyComplete: () => void copyChatTranscript(chatId, title, "complete"),
      copyLink: () => void copyWorkspaceLink(workspace.id, undefined, chatId).then(({ kind, message }) => notify?.(kind, message)),
      close: closable ? () => closeReview(chatId) : undefined,
      closeOthers: reviews.tabs.some((r) => r.chatId !== chatId) ? () => closeOtherChats(chatId) : undefined,
    };
  };
  // Shown unless "right_panel_visible" is false (⌥⌘B / zen mode, bound in App).
  const prefs = useAppPrefs();
  const rightPanelVisible = prefs.right_panel_visible;
  return (
    <div className="workspace">
      <header className="ws-header" data-tauri-drag-region="deep">
        <div className="ws-title">
          <RepoHeaderMenu repo={repo} onError={(message) => notify?.("error", message)} />
          <span className="crumb-sep">/</span>
          <WorkspaceNameHeader
            key={workspace.id}
            repoId={repo.id}
            workspace={workspace}
            sections={sections}
            dispatch={dispatch}
            onNewSection={onNewSection}
            onCopyLink={(ws) => void copyWorkspaceLink(ws.id).then(({ kind, message }) => notify?.(kind, message))}
            onError={(message) => notify?.("error", message)}
          />
          <WorkspaceBranchHeader repoId={repo.id} workspace={workspace} dispatch={dispatch} onError={(message) => notify?.("error", message)} />
          <TargetChip target={target} open={pickingTarget} setOpen={setPickingTarget} repo={repo} />
          {prNumber !== null && (
            <button
              className="chip pr-chip"
              title="Open the PR tab"
              onClick={openPrTab}
              onContextMenu={(e) => {
                // Conductor's PR badge (`RFt`) opens `w_i` on right-click.
                if (!pullRequest.pr?.url) return;
                e.preventDefault();
                setPrMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              PR #{prNumber}
            </button>
          )}
          {prMenu && pullRequest.pr?.url && prNumber !== null && <PrBadgeMenu url={pullRequest.pr.url} number={prNumber} at={prMenu} onClose={() => setPrMenu(null)} notify={notify} />}
          {settingUp && (
            <span className="chip status setting-up" role="status">
              <span className="status-dot working" /> {RUNNING_SETUP}
            </span>
          )}
        </div>
        <div className="ws-actions">
          {workspace.status !== "archived" && <OpenInButton path={workspace.path ?? null} notify={notify} />}
          <PrControl pullRequest={pullRequest} actions={prActions} notify={notify} />
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
        <div className="ws-main">
          <MainTabs browserTab={browserPage ? <BrowserPreviewTab page={browserPage} selected={showBrowser} onSelect={() => setMainTab("browser")} onClose={closeBrowser} /> : null} fileTab={fileTarget?.workspaceId === workspace.id ? <span className={`main-tab${showFile ? " active" : ""}`}><button role="tab" aria-selected={showFile} onClick={() => setMainTab("file")}>{fileTarget.path.split("/").pop()}</button><button className="main-tab-close" aria-label={`Close ${fileTarget.path} tab`} onClick={closeFile}>×</button></span> : null} title={workspace.chatTitle ?? workspace.name} active={activeTab} diffOpen={diffOpen} prTab={prOpen ? (prNumber !== null ? `PR #${prNumber}` : "PR") : null} onClosePr={closePrTab} reviews={reviews.tabs} terminals={centerTerminals} onCloseTerminal={(id) => closeTab(workspace.id, id)} onSelect={setMainTab} onCloseDiff={closeDiffTab} onCloseReview={closeReview} mainChatId={primaryId} isUnread={(chatId) => isChatUnread(workspace, chatId)} onToggleRead={toggleChatRead} chatMenu={chatMenu} newChat={<NewChatButton openTabs={openChatTabs} onNewChat={newChat} />} />
          <div className="ws-chat-host" hidden={centerTerminal !== undefined || showBrowser}>
          <KeybindingScope focused={centerTerminal === undefined && !showBrowser}>
        <ChatPanel
          key={activeReview?.chatId ?? primaryId}
          repo={repo}
          workspace={workspace}
          dispatch={dispatch}
          notify={notify}
          chatId={activeReview?.chatId ?? primaryId}
          onClearLocal={(sourceId, replacement) => {
            const title = reviews.replaceLocal(sourceId, replacement);
            dispatch({ type: "replaceLocalChat", repoId: repo.id, workspaceId: workspace.id, sourceId, chatId: replacement.chatId, primaryChatId: replacement.primaryChatId, title });
            if (displayedWorkspace.current === workspace.id) setMainTab(tabOfChat(replacement.primaryChatId, replacement.chatId));
          }}
          review={activeReview}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          openTurnFile={diff.openTurnFile}
          openFile={diff.openPath}
          // Conductor hides the button once the workspace's PR is merged (g1o's `hidden`, `mIo` isMerged).
          onNextUnread={!prBase?.merged && hasNextUnread?.(selectedChat) ? onNextUnread : undefined}
          forkToNewTab={reviews.fork}
          chatTabs={[{ chatId: primaryId, title: workspace.chatTitle ?? workspace.name }, ...reviews.tabs.map((r) => ({ chatId: r.chatId, title: r.title }))]}
          content={
            showFile && fileTarget && workspace.path ? (
              <MarkdownFileView key={`${workspace.id}:${fileTarget.path}`} worktree={workspace.path} path={fileTarget.path} />
            ) : showDiff ? (
              <DiffTab diff={diff} onClose={autoCloseDiffTab} onLineClick={review.onLineClick} commentRange={review.commentRange} anchors={review.anchors} annotations={review.annotations} onPersistAnchors={review.persistAnchors} notes={review.notes} notify={notify} />
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
                notify={notify}
              />
            ) : null
          }
        />
          </KeybindingScope>
          </div>
          {showBrowser && <BrowserPreviewAnchor workspaceId={workspace.id} url={browserPage.url} />}
          {centerTerminal && (
            <section className="center-terminal terminal-panel" aria-label="Center terminal">
              <TerminalHost key={centerTerminal.id} id={centerTerminal.id} status={centerTerminal.status} sessionId={selectedChat} onAddToChat={(text) => addTerminalSelection(selectedChat, text)} />
            </section>
          )}
        </div>
        {rightPanelVisible && (
          <div className={`ws-right${stripOpen ? "" : " strip-collapsed"}`}>
            <RightPanel
              onOpenFile={openMarkdown}
              workspaceId={workspace.id}
              activeFilePath={showDiff ? diff.selected?.path : showFile ? fileTarget.path : undefined}
              tab={gitPanelTab}
              setTab={setGitPanelTab}
              diff={diff}
              actions={review.actions}
              targetControl={<TargetChip target={target} open={pickingChangesTarget} setOpen={setPickingChangesTarget} repo={repo} variant="menu" />}
              pr={pullRequest}
              worktree={workspace.path ?? null}
              review={<ReviewButton onReview={() => void reviews.start()} onEdit={() => void reviews.start(true)} error={reviews.error} disabled={workspace.status === "archived"} />}
              fixErrors={fixErrors}
              readOnly={workspace.status === "archived"}
              notify={notify}
              emptyAction={<PullLatestButton pullLatest={pullLatest} agentWorking={agentWorking} />}
            />
            <PanelStrip repo={repo} workspace={workspace} open={stripOpen} setOpen={setStripOpen} view={stripView} setView={setStripView} cwd={workspace.path ?? repo.path} onAskSetupAgent={workspace.status === "archived" ? undefined : askSetupAgent} onOpenPreview={workspace.status === "archived" ? undefined : openPreview} chatSessionId={selectedChat} onAddTerminalSelection={(text) => addTerminalSelection(selectedChat, text)} />
          </div>
        )}
      </div>
      {renaming && (
        <RenameChatDialog
          key={renaming.chatId}
          currentTitle={renaming.title}
          onRename={(title) => renameChat(renaming.chatId, title)}
          onClose={() => setRenaming((current) => current?.chatId === renaming.chatId ? null : current)}
          onError={(message) => notify?.("error", `Failed to rename chat: ${message}`)}
        />
      )}
      <DiffDiscardHost diff={diff} onDiscarded={(f) => chatBridge.current?.attach(revertedNote(f.path))} />
    </div>
  );
}
