import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode } from "react";
import type { Repo, Workspace } from "../state/types";
import type { Action } from "../state/store";
import { BranchIcon, RightSidebarIcon } from "./Icons";
import { toggleRightPanel } from "./panelPrefs";
import { Transcript } from "../features/chat/Transcript.tsx";
import { answerPermission, chatSnapshot, configureReason, configureReasonDefault, queueAction, REASON_CAN_STEER, reasonAvailable, reasonChatConfig, resetReasonChat, sendReason, stopChat, submitChat, subscribeChat, type PermissionPrompt } from "../features/chat/reasonChat.ts";
import { PermissionRequests } from "../features/chat/PermissionRequests.tsx";
import { forkAttachmentName, forkTranscript, turnAgentLabel } from "../features/chat/fork.ts";
import { forkToNewWorkspace } from "../features/chat/forkWorkspace.ts";
import { createWorkspace, ensureRepository } from "../workspace/api";
import { generateWorkspaceNames } from "../workspace/naming";
import { startSetupScript } from "../home/createFirstWorkspace";
import type { ConfigChoice } from "../features/diff/review.ts";
import { Composer } from "../features/chat/Composer.tsx";
import { ChatModelPicker } from "../features/chat/ChatModelPicker.tsx";
import { ChatEmptyState } from "../features/chat/ChatEmptyState.tsx";
import { lastUserMessageAt, type OtherChat } from "../features/chat/chatEmptyState.ts";
import type { ChatAgent } from "../features/chat/chatAgentChoice.ts";
import { commandSet, isKnownCommand, parseSlashCommand } from "../features/chat/slashCommands.ts";
import { defaultChatConfig } from "../features/chat/chatModel.ts";
import { getSettings } from "../settings/api";
import type { SendMode } from "../features/chat/queue.ts";
import { ResetChatDialog } from "../features/chat/ResetChatDialog.tsx";
import { answerCodex, CODEX_ACCESS, CODEX_CAN_STEER, codexAccess, codexQueueAction, codexSnapshot, setCodexAccess, stopCodex, submitCodex, subscribeCodex, type CodexAccess, type CodexSnapshot } from "../features/chat/codexChat.ts";
import { DECISION_LABELS, type CodexApproval, type CodexDecision } from "../features/chat/codex.ts";
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
import { attachmentPath, promptText, randomDir, rejectReason, type ComposerAttachment } from "../features/chat/composerAttachments.ts";
import { draftAttachmentsApi } from "../features/draft-attachments/api.ts";

/** Sends a message with attached text files from the chat shown (Fix errors). */
interface AttachedSend {
  sendWith(text: string, attachments: TextAttachment[]): void;
}
type ShownChatBridge = ChatBridge & ComposerAttach & AttachedSend;
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { openBigTab } from "../features/terminal/session";
import { bigTabRequest } from "../features/terminal/bigTerminal";
import { useKeybindings } from "../keybindings/KeybindingsProvider.tsx";
import { ScriptsPanel } from "./ScriptsPanel";
import { useCreateSetupRunning } from "../workspace/useSetupWatch";
import { RUNNING_SETUP } from "../workspace/createFlow";
import { usePullRequest, type PullRequest } from "../features/pr/usePullRequest";
import { rowPrOf } from "../features/pr/rowPr";
import { useArchiveOnMerge, type ArchiveNotify } from "../features/pr/useArchiveOnMerge";
import { ChecksTab } from "../features/pr/checks/ChecksTab";
import { AllFilesTree } from "../features/files/AllFilesTree";
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
import { useFollowUpMode } from "../settings/useFollowUpMode";
import { OpenInButton } from "../features/openIn/OpenInButton";

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
/** The "/" menu for a Reason chat: Reason runs as an ACP agent, so only its own commands (none reported yet). */
const SLASH_COMMANDS = commandSet({ agent: "acp" });
const CODEX_SLASH_COMMANDS = commandSet({ agent: "codex" });
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
  const agent = reason && savedAgent(chatId) === "codex" ? "codex" : "reason";
  const messages = (agent === "codex" ? codexSnapshot(chatId) : chatSnapshot(chatId)).transcript.messages;
  return { chatId, title, agent, lastUserMessageAt: lastUserMessageAt(messages) };
}

// Which agent runs a chat; each keeps its own transcript.
const agentKey = (chatId: string) => `openconductor.agent.${chatId}`;
const savedAgent = (chatId: string): ChatAgent => (localStorage.getItem(agentKey(chatId)) === "codex" ? "codex" : "reason");

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

/** What the chat panel shows: Codex's approvals, or Reason's permission requests. */
type ChatView = CodexSnapshot & { permissions?: readonly PermissionPrompt[] };

function ChatPanel({ repo, workspace, dispatch, chatId, review, bridge, tabs, content, onRunningChange, openTurnFile, openFile, forkToNewTab, chatTabs }: ChatPanelProps) {
  const reason = reasonAvailable();
  const cwd = workspace.path ?? repo.path;
  const main = chatId === workspace.id;
  const [agent, setAgent] = useState<ChatAgent>(() => savedAgent(chatId));
  const codex = reason && agent === "codex";
  const snapshotOf = (a: ChatAgent): ChatView => (reason && a === "codex" ? codexSnapshot(chatId) : { ...chatSnapshot(chatId), approvals: [] });
  const [{ transcript, queue, approvals, permissions = [] }, setSnapshot] = useState<ChatView>(() => snapshotOf(agent));
  const [access, setAccess] = useState<CodexAccess>(() => codexAccess(chatId));
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
  const followUpMode = useFollowUpMode();

  useEffect(() => {
    setAgent(savedAgent(chatId));
    setAccess(codexAccess(chatId));
  }, [chatId]);

  // Follows the chat and its agent (picking another agent shows that agent's transcript and queue).
  useEffect(() => {
    setSnapshot(snapshotOf(agent));
    return codex ? subscribeCodex(chatId, setSnapshot) : subscribeChat(chatId, (s) => setSnapshot({ ...s, approvals: [] }));
  }, [chatId, agent]);

  function chooseAgent(next: ChatAgent) {
    localStorage.setItem(agentKey(chatId), next);
    setAgent(next);
  }

  useEffect(() => {
    setDraft("");
    setAttachments([]);
    setAttachError(null);
    setResetTurn(null);
    const pendingMessage = takePendingMessage(chatId);
    if (pendingMessage?.kind === "draft") {
      setDraft(pendingMessage.text);
      setAttachments(pendingMessage.attachments ?? []);
      inputRef.current?.focus();
    }
    // The workspace's chat runs the default model unless the New workspace dialog picked one.
    if (main) configureReasonDefault(chatId, getSettings().then(defaultChatConfig));
    if (pendingMessage?.kind === "send") submit(pendingMessage.text, "queue", pendingMessage.attachments);
    const first = main ? firstPrompts.get(workspace.id) : undefined;
    if (first !== undefined) {
      firstPrompts.delete(workspace.id);
      if (reason && savedAgent(chatId) === "codex") submitCodex(chatId, cwd, first);
      else sendReason(workspace.id, cwd, first, [], repo.path || undefined);
    }
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
  // Codex gets them inline in the prompt.
  function submit(text: string, mode: SendMode, attached: readonly TextAttachment[] = []) {
    const useCodex = reason && savedAgent(chatId) === "codex";
    const before = useCodex ? codexSnapshot(chatId).transcript : chatSnapshot(chatId).transcript;
    const first = main && !before.messages.some((m) => m.role === "user");
    if (useCodex) submitCodex(chatId, cwd, text, attached);
    else submitChat(chatId, cwd, text, mode, attached, repo.path || undefined);
    dispatch({ type: "touchWorkspace", repoId: repo.id, workspaceId: workspace.id, at: Date.now() });
    if (first) void renameAfterFirstMessage(repo, workspace, text, dispatch);
  }

  // The chat's model, for the turn footer hover. A Codex chat names only its agent.
  useEffect(() => {
    let live = true;
    setTurnAgent(codex ? "Codex" : "Reason");
    if (!codex)
      void reasonChatConfig(chatId).then((config) => {
        if (live) setTurnAgent(turnAgentLabel(config.find((o) => o.id === "model")?.value, "Reason"));
      });
    return () => {
      live = false;
    };
  }, [chatId, codex]);

  /**
   * Conductor's "Fork to new tab" (`y9t`): a new tab in this workspace on this
   * chat's options, with the conversation up to `turnId` attached as
   * "Transcript of <title>.md" and this composer's text copied. Not sent.
   */
  async function forkToTab(turnId: string) {
    setAttachError(null);
    const markdown = forkTranscript(transcript, turnId);
    if (markdown === null) {
      setAttachError("Unable to fork chat to new tab: failed to generate chat transcript");
      return;
    }
    setForking(true);
    try {
      const config = codex ? [] : await reasonChatConfig(chatId);
      const title = review?.title ?? workspace.name;
      const id = forkToNewTab(`Fork of ${title}`, config, { text: draft, attachments: [{ name: forkAttachmentName(title), text: markdown }] });
      if (codex) localStorage.setItem(agentKey(id), "codex");
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
      const backendRepo = await ensureRepository(repo.path);
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
      const title = review?.title ?? workspace.name;
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
      {content}
      <div className="chat-scroll" hidden={content !== null}>
        {review && !review.fork && (
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
              const text = forkTranscript((c.agent === "codex" ? codexSnapshot(c.chatId) : chatSnapshot(c.chatId)).transcript);
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
            // Conductor: workspace with a path, not archived; disabled while the agent works.
            // Reset chat and turn changes come from Reason turn checkpoints; Codex turns have none yet.
            onResetChat={reason && !codex && workspace.status !== "archived" ? setResetTurn : undefined}
            resetDisabled={running}
            turnFooter={codex ? undefined : turnFooter}
            workspacePath={cwd}
            onOpenFile={openFile ? (path) => openFile(path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path) : undefined}
            // Conductor: any turn of a chat in a workspace that is not archived; disabled while a fork is made.
            onForkToNewTab={workspace.status !== "archived" ? (turnId) => void forkToTab(turnId) : undefined}
            // Conductor: the same, and only for a workspace on this machine. It restores the turn's
            // end checkpoint, which only Reason turns have so far.
            onForkToNewWorkspace={reason && !codex && workspace.path && workspace.status !== "archived" ? (turnId) => void forkToWorkspace(turnId) : undefined}
            forkDisabled={forking}
            turnAgent={turnAgent}
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
      <PermissionRequests permissions={permissions} onAnswer={(requestId, optionId) => void answerPermission(chatId, requestId, optionId)} />
      {codex && approvals.length > 0 ? (
        <div className="codex-approvals">
          {approvals.map((a) => (
            <ApprovalCard key={String(a.requestId)} approval={a} onAnswer={(d) => void answerCodex(chatId, a.requestId, d)} />
          ))}
        </div>
      ) : null}
      <Composer
        draft={draft}
        setDraft={setDraft}
        inputRef={inputRef}
        queue={queue}
        canSteer={codex ? CODEX_CAN_STEER : REASON_CAN_STEER}
        followUpMode={followUpMode}
        onSubmit={onSubmit}
        onStop={() => (codex ? stopCodex : stopChat)(chatId)}
        onQueue={(action) => (codex ? codexQueueAction : queueAction)(chatId, action)}
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
          review ? (
            <span className="oc-review-model">{review.modelLabel}</span>
          ) : (
            // A review chat keeps its model. The agent changes only between turns.
            <ChatModelPicker chatId={chatId} agent={codex ? "codex" : "reason"} onAgentChange={reason && !running ? chooseAgent : undefined} />
          )
        }
        slashCommands={codex ? CODEX_SLASH_COMMANDS : SLASH_COMMANDS}
        onCommand={(text) => {
          // Reason runs as an ACP agent and Codex here through its app server: Conductor's built-in commands are not wired for either yet.
          const commands = codex ? CODEX_SLASH_COMMANDS : SLASH_COMMANDS;
          const cmd = parseSlashCommand(text, isKnownCommand);
          if (!cmd || commands.some((c) => c.name === cmd.name && c.effect === "agent")) return false;
          const who = codex ? "Codex" : "Reason";
          setAttachError(cmd.name === "plan" ? "Plan mode is not available in this chat." : `/${cmd.name} is not available for ${who}.`);
          return true;
        }}
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
    </section>
  );
}

interface RightPanelProps {
  diff: WorkspaceDiff;
  actions: () => ReactNode;
  pr: PullRequest;
  worktree: string | null;
  review: ReactNode;
  repo: Repo;
  /** Fix errors: send to the workspace's own chat. */
  sendToChat: (text: string, attachments: TextAttachment[]) => void;
  readOnly: boolean;
  notify?: ArchiveNotify;
}

function RightPanel({ diff, actions, pr, worktree, review, repo, sendToChat, readOnly, notify }: RightPanelProps) {
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
          repoId={repo.id}
          sendToChat={sendToChat}
          readOnly={readOnly}
        />
      ) : (
        <AllFilesTree worktree={worktree} notify={notify} />
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
          <button role="tab" aria-selected={active === r.chatId} className={active === r.chatId ? "active" : ""} onClick={() => onSelect(r.chatId)} title={r.fork ? r.title : `Code review on ${r.modelLabel}`}>
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

export function WorkspaceView({ repo, workspace, dispatch, notify }: Props) {
  // Conductor shows no terminal by default: ⌘J (view.toggleTerminalPanel) shows it,
  // and ⌘⇧T opens a big terminal while Big terminal mode is on.
  const [showTerminal, setShowTerminal] = useState(false);
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
    "git.openInGitHub": prActions.openOnGitHub,
  });
  // ⌘⇧T inside a terminal is handled by the terminal itself (session.ts), so this one skips terminal focus.
  useKeybindings(
    {
      "terminal.newBigTab": () => {
        const big = bigTabRequest();
        if (!big || !repo.path) return false;
        void openBigTab(workspace.id, repo.path, big)
          .catch(() => {})
          .finally(() => setShowTerminal(true));
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
          chatId={activeReview?.chatId ?? workspace.id}
          review={activeReview}
          bridge={chatBridge}
          onRunningChange={setAgentWorking}
          openTurnFile={diff.openTurnFile}
          openFile={diff.openPath}
          forkToNewTab={reviews.fork}
          chatTabs={[{ chatId: workspace.id, title: workspace.name }, ...reviews.tabs.map((r) => ({ chatId: r.chatId, title: r.title }))]}
          tabs={<MainTabs title={workspace.name} active={activeTab} diffOpen={diffOpen} prTab={prOpen ? (prNumber !== null ? `PR #${prNumber}` : "PR") : null} onClosePr={closePrTab} reviews={reviews.tabs} onSelect={setMainTab} onCloseDiff={closeDiffTab} onCloseReview={closeReview} />}
          content={
            showDiff ? (
              <DiffTab diff={diff} onLineClick={review.onLineClick} commentRange={review.commentRange} anchors={review.anchors} annotations={review.annotations} notes={review.notes} />
            ) : showPr ? (
              <PrTab
                worktree={workspace.path ?? null}
                pr={pullRequest.pr}
                refresh={pullRequest.refresh}
                repoId={repo.id}
                sendToChat={sendToChat}
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
              repo={repo}
              sendToChat={sendToChat}
              readOnly={workspace.status === "archived"}
              notify={notify}
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
