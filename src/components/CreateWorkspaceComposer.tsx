import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type Dispatch, type FormEvent } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { seedTranscript } from "./WorkspaceView";
import { configureReason } from "../features/chat/reasonChat";
import { sessionConfig } from "../features/chat/chatModel";
import { generateWorkspaceNames, resolveBranchPrefix, type BranchPrefixSettings, type GeneratedName } from "../workspace/naming";
import {
  FAILED_TO_CREATE,
  buildCreateRequest,
  newDraft,
  progressLabel,
  selectFrom,
  reduceProgress,
  toCreateWorkspaceArgs,
  type CreateDraft,
  type DraftErrors,
} from "../workspace/createFlow";
import { createWorkspace, ensureRepository, errorText, listBranches, type BranchDto, type CreatedWorkspaceDto, type RepositoryDto } from "../workspace/api";
import { scriptsConfig, startSetup } from "../scripts/api";
import { workspaceRef } from "../scripts/model";
import { unwatchSetup, watchSetup } from "../workspace/setupWatch";
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import { addPendingLaunch, removePendingLaunch } from "../workspace/pendingLaunches";
import type { SourceState } from "../workspace/createFrom";
import { launchDefaults, loadoutPicks, pickLaunch, type LaunchModel, type LaunchPick } from "../workspace/launchModel";
import { ModelPicker } from "../features/chat/ModelPicker";
import { openSettingsPage } from "../features/chat/ChatModelPicker";
import { useLoadout } from "../settings/agents/useLoadout";
import { loadoutChoices } from "../features/chat/loadoutChoices";
import { saveModelChoice } from "../features/chat/chatModelChoice";
import { saveAgent } from "../features/chat/agentChoice";
import { CreateFromPicker } from "./CreateFromPicker";
import type { Settings } from "../settings/types";
import { modelLabel } from "../settings/models";
import type { AddRepositoryActions } from "./AddRepositoryMenu";
import { RepoSelect } from "./create/RepoSelect";
import { TargetBranchButton } from "./create/TargetBranchButton";
import { useKeybindingOverrides, useKeybindings } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs, matchesEvent } from "../keybindings/shortcut";
import { usePresence } from "./motion/usePresence";
import { Tooltip } from "./ui/Tooltip";
import { ComposerAttachmentChip } from "../features/chat/ComposerAttachmentChip";
import type { ComposerAttachment } from "../features/chat/composerAttachments";
import { attachmentPath, inlineText, promptText, randomDir, rejectReason, safeFileName } from "../features/chat/composerAttachments";
import { draftAttachmentsApi } from "../features/draft-attachments/api.ts";
import type { PromptAttachment } from "../features/chat/reason";
import { queuePending } from "../features/diff/ReviewButton";
import { PaperclipIcon, PlusIcon } from "../features/chat/composerIcons";
import type { NavSection } from "../state/navigationSections";
import { CREATE_IN_SECTION, SECTION_ASSIGN_FAILED, canCreateIn, sectionChoice } from "../workspace/createInSection";
import "../features/chat/composer.css";
import { ComposerEditor, type ComposerEditorHandle } from "../features/chat/ComposerEditor.tsx";
import type { PlanModeControl } from "../features/chat/useLocalPlanMode.ts";
import { composerPrompt } from "../features/chat/composerDocument.ts";
import { preWorkspaceRef } from "../features/chat/preWorkspaceCompletions.ts";
import { CreateWorkspaceSuggestions, useCreateWorkspaceSuggestions } from "./create/CreateWorkspaceSuggestions.tsx";

/**
 * Where the repo / branch / create-from row sits (Conductor's `eyebrowVariant`):
 * joined to the top of the card in the dialog, above it on the full-screen page.
 */
export type EyebrowVariant = "attached" | "floating";

export interface CreateWorkspaceComposerProps {
  repos: Repo[];
  initialRepoId: string | null;
  /** `branch_prefix_type` / `branch_prefix` settings. */
  prefixSettings: BranchPrefixSettings;
  githubUsername: string | null;
  eyebrowVariant: EyebrowVariant;
  /** The workspace was added (and selected), or the user backed out. */
  onClose: () => void;
  /** An accepted launch can dismiss its modal before creation settles. */
  onLaunchStart?: () => void;
  onBusyChange?: (busy: boolean) => void;
  /** The repo picker's "Add project" menu: Open project, Open GitHub project, Quick start, Recents. */
  addActions: AddRepositoryActions;
  /** Persistent launch errors and non-fatal workspace creation issues. */
  onWarning: (message: string) => void;
  dispatch: Dispatch<Action>;
  /** The sidebar's sections, for "Create in section". */
  sections?: readonly NavSection[];
  /** The section the composer was opened from (its menu's Create workspace). */
  initialSectionId?: string;
  /** Open with the "Create from..." picker showing (the repo menu's Create from..., ⌘⇧N). */
  fromOpen?: boolean;
}

/** Conductor's composer placeholder for a new workspace (`oya` -> `Hji`). */
export const CREATE_PLACEHOLDER = "What do you want to work on?";

function suggestName(repo: Repo | undefined, branches: string[] = []): GeneratedName | null {
  if (!repo) return null;
  const taken = [...repo.workspaces.flatMap((w) => [w.name, w.branch]), ...branches.map((b) => b.replace(/^.*\//, ""))];
  return generateWorkspaceNames(1, taken, Math.random)[0];
}

/**
 * The create-workspace composer, shared by the dialog and the full-screen
 * page: an eyebrow row with the repository, base branch and create-from
 * pickers, the first message, the model and effort picker, and Create.
 * The workspace takes a generated city name; the first message renames it.
 */
export function CreateWorkspaceComposer({
  repos,
  initialRepoId,
  prefixSettings,
  githubUsername,
  eyebrowVariant,
  onClose,
  onLaunchStart,
  onBusyChange,
  addActions,
  onWarning,
  dispatch,
  sections = [],
  initialSectionId,
  fromOpen,
}: CreateWorkspaceComposerProps) {
  const choice = sectionChoice(sections, initialSectionId);
  // The create outlives a render; check the section against the latest list when assigning.
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const startRepo = repos.find((r) => r.id === initialRepoId) ?? repos[0];
  const loadout = useLoadout();
  const settings = loadout?.settings ?? null;
  const favorites = loadoutPicks(loadout?.slots ?? []);
  const modelEdited = useRef(false);
  /** An explicit choice overrides the live default, including an explicit opt-out. */
  const [selectedPlanMode, setSelectedPlanMode] = useState<boolean>();
  const createPlanMode = selectedPlanMode ?? (settings?.models.default_plan_mode === true);
  const toggleCreatePlanMode = () => setSelectedPlanMode((value) => !(value ?? (settings?.models.default_plan_mode === true)));
  /** Files attached in the create composer; delivered with the first message via queuePending. */
  const [createAttachments, setCreateAttachments] = useState<ComposerAttachment[]>([]);
  const [draftWorkspaceId] = useState(() => crypto.randomUUID());
  const pendingFiles = useRef(0);
  const [stagingFiles, setStagingFiles] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachPreviewEpoch, setAttachPreviewEpoch] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Rich-text editor handle for the create composer's first-message field (Conductor: Hji uses ComposerEditor). */
  const composerInputRef = useRef<ComposerEditorHandle>(null);
  // Auto-focus the editor on mount (mirrors the textarea's autoFocus attribute).
  useLayoutEffect(() => { composerInputRef.current?.focus(); }, []);
  const [draft, setDraft] = useState<CreateDraft>(() =>
    newDraft({ repoId: startRepo?.id ?? null, defaultBranch: startRepo?.defaultBranch ?? "main", cityName: suggestName(startRepo)?.name ?? "", ...launchDefaults(null) }),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [branchSrc, setBranchSrc] = useState<SourceState<BranchDto>>({ status: "loading" });
  const [progress, send] = useReducer(reduceProgress, { step: "idle" });
  const repo = repos.find((r) => r.id === draft.repoId);
  const prefix = useMemo(() => resolveBranchPrefix(prefixSettings, githubUsername), [prefixSettings, githubUsername]);
  const [branchAttempt, setBranchAttempt] = useState(0);
  const busy = stagingFiles > 0 || progress.step === "creating" || progress.step === "detecting_setup";
  const suggestions = useCreateWorkspaceSuggestions({
    identity: repo?.path && branchSrc.status !== "loading" ? { repositoryId: repo.id, ref: preWorkspaceRef(draft.from, draft.baseBranch), agentType: draft.agent } : null,
    inputRef: composerInputRef,
    disabled: busy,
  });
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  const { overrides } = useKeybindingOverrides();
  const submitKeys = [...effectiveShortcuts("chat.submitMessage", overrides), ...effectiveShortcuts("chat.submitOppositeFollowUp", overrides)];
  const backlogKeys = effectiveShortcuts("workspace.addToBacklogFromComposer", overrides);
  const newlineKeys = effectiveShortcuts("chat.newLine", overrides);
  const submitShortcut = effectiveShortcuts("chat.submitMessage", overrides)[0];
  const submitHint = submitShortcut ? glyphs(submitShortcut) : "↵";
  const hint = (commandId: string) => {
    const first = effectiveShortcuts(commandId, overrides)[0];
    return first ? glyphs(first) : undefined;
  };

  // With no repository yet, the first one added (opened or cloned) is chosen.
  useEffect(() => {
    if (!draft.repoId && repos[0]) chooseRepo(repos[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos.length]);
  // A project added while the composer is open ("Add project" in the repo picker) becomes its repository.
  const knownRepoIds = useRef(new Set(repos.map((r) => r.id)));
  useEffect(() => {
    const added = repos.find((r) => !knownRepoIds.current.has(r.id));
    knownRepoIds.current = new Set(repos.map((r) => r.id));
    if (added) chooseRepo(added.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos]);

  useEffect(() => {
    if (loadout && !modelEdited.current) setDraft((d) => ({ ...d, ...launchDefaults(loadout.settings, loadout.slots) }));
  }, [loadout]);

  useEffect(() => {
    if (!repo?.path) return setBranchSrc({ status: "ready", items: [{ name: repo?.defaultBranch ?? "main", remote: null, commit: "", isHead: true, committedAt: 0 }] });
    let live = true;
    setBranchSrc({ status: "loading" });
    ensureRepository(repo.path, repo.id)
      .then((r) => listBranches(r.id, repo.defaultBranch))
      .then((list) => {
        if (!live) return;
        const names = list.map((b) => b.name);
        setBranchSrc({ status: "ready", items: list });
        // Re-roll a placeholder that collides with an existing branch.
        setDraft((d) => {
          if (d.nameEdited || !names.some((b) => b.replace(/^.*\//, "") === d.name)) return d;
          const next = suggestName(repo, names);
          return next ? { ...d, name: next.name } : d;
        });
      })
      .catch((e) => live && setBranchSrc({ status: "error", message: errorText(e) }));
    return () => {
      live = false;
    };
  }, [repo?.id, branchAttempt]);

  /** Wire ⌘U to open the file picker (matches the main Composer's chat.addAttachment handler). */
  useKeybindings({
    "chat.addAttachment": () => { if (!busy) fileInputRef.current?.click(); },
  });

  // Hji binds Plan mode only while its editor is focused; the menu owns the same state.
  useKeybindings({
    "chat.togglePlanMode": () => {
      if (draft.agent !== "claude" || busy || !composerInputRef.current?.focused()) return false;
      toggleCreatePlanMode();
    },
  }, { enableOnDialogIds: eyebrowVariant === "attached" ? ["dialog"] : undefined });

  /** Stage binary bytes under this draft's identity before a workspace exists. */
  async function attachFiles(files: File[]) {
    if (progress.step === "creating" || progress.step === "detecting_setup") return;
    pendingFiles.current++;
    setStagingFiles(pendingFiles.current);
    setAttachError(null);
    try {
      for (const file of files) {
        const reject = rejectReason(file);
        if (reject) { setAttachError(reject); continue; }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const name = safeFileName(file.name);
          const text = inlineText(bytes);
          let attachment: ComposerAttachment;
          if (text !== null) attachment = { name, text, preview: "text" };
          else {
            const relativePath = attachmentPath(name, randomDir());
            await draftAttachmentsApi.write({ draftWorkspaceId, relativePath, data: bytes });
            attachment = { name: relativePath, label: name, text: promptText(bytes, relativePath), staged: relativePath };
          }
          setCreateAttachments((prev) => prev.some((a) => a.name === attachment.name) ? prev : [...prev, attachment]);
        } catch (err) {
          setAttachError(`Failed to attach ${file.name}: ${errorText(err)}`);
        }
      }
    } finally {
      pendingFiles.current--;
      setStagingFiles(pendingFiles.current);
    }
  }

  /** Do not hand an agent a path until the existing store confirms its copy. */
  async function materializeAttachments(workspacePath: string) {
    if (!createAttachments.some((a) => a.staged)) return;
    const report = await draftAttachmentsApi.materialize({ localWorkspaceId: draftWorkspaceId, workspacePath });
    for (const attachment of createAttachments) {
      if (!attachment.staged) continue;
      const result = report.attachments.find((a) => a.relativePath === attachment.staged);
      if (!result || result.error) throw new Error(result?.error ?? `Attachment was not copied: ${attachment.label ?? attachment.name}`);
    }
  }

  function chooseRepo(id: string) {
    const next = repos.find((r) => r.id === id);
    setDraft((d) => {
      const name = d.nameEdited ? null : suggestName(next);
      return { ...selectFrom(d, null), repoId: id, baseBranch: next?.defaultBranch ?? "main", name: name?.name ?? d.name };
    });
    setErrors({});
  }

  function chooseLaunch(next: LaunchModel) {
    modelEdited.current = true;
    setDraft((d) => ({ ...d, ...next }));
  }

  async function submit(e?: FormEvent, sectionId: string | undefined = choice.sectionId) {
    e?.preventDefault();
    if (busy || pendingFiles.current > 0 || !repo || !canCreateIn(sectionsRef.current, sectionId)) return;
    const built = buildCreateRequest({ ...draft, firstMessage: composerPrompt(draft.firstMessage) }, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    // The sidebar shows an "Untitled" initializing row in this repo until the workspace is added or fails.
    const pendingId = crypto.randomUUID();
    addPendingLaunch(pendingId, repo.id);
    let dismissedAtLaunch = false;
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      if (onLaunchStart) {
        onLaunchStart();
        dismissedAtLaunch = true;
      }
      const backendRepo = await ensureRepository(repo.path, repo.id);
      const created = await createWorkspace(toCreateWorkspaceArgs({ ...built.request, repoId: backendRepo.id }));
      send({ type: "created", workspaceId: created.workspace.id });
      if (created.upstreamWarning) onWarning(created.upstreamWarning);
      const setupStarted = await startSetupScript(backendRepo, created, built.request.targetBranch);
      const { id, directoryName, branchName, path } = created.workspace;
      const { naming, firstSession } = built.request;
      const ws = {
        id,
        name: directoryName,
        branch: branchName,
        path,
        targetBranch: built.request.targetBranch,
        placeholderBranchName: naming.placeholder_branch_name === null ? null : branchName,
        userSetWorkspaceName: naming.user_set_workspace_name,
        userSetBranchName: naming.user_set_branch_name,
        number: created.number ?? null,
        // GAP-SB-01: pass state so the sidebar row dims while setup runs and
        // clears immediately when no setup script starts (store default was
        // always "setting_up", leaving the row permanently dimmed).
        state: setupStarted ? "setting_up" : "ready",
      };
      if (draft.agent === "reason" || draft.agent === "claude" || draft.agent === "codex") {
        saveAgent(id, draft.agent);
        saveModelChoice(id, { agent: draft.agent, model: draft.model, effort: draft.effort || null });
      }
      // M10 fix: always configure the Reason session model/effort when the Reason agent is chosen,
      // regardless of whether there is a first message. Without this an empty-prompt workspace
      // opens with the global default model instead of the user's chosen model/effort. For
      // 'claude' or 'codex', configureReason is not called at all (saveModelChoice above handles
      // those agents; calling configureReason with a local agent's model ID misroutes the chat).
      if (draft.agent === "reason") {
        const model = firstSession?.model ?? draft.model;
        const effort = firstSession?.effort ?? draft.effort;
        configureReason(id, sessionConfig(model, effort));
      }
      // Persist the effective Claude choice before exposing a workspace that can send.
      // Both true and false matter: the backend otherwise seeds from the global default.
      const text = firstSession?.message ?? "";
      const promptAttachment = ({ name, text, commentId }: ComposerAttachment): PromptAttachment =>
        commentId ? { name, text, commentId } : { name, text };
      let seededFirstMessage = false;
      let recovery = "Review Plan mode before sending";
      try {
        if (draft.agent === "claude") {
          await invoke<unknown>("local_plan_mode_set", { chatId: id, workspaceId: id, mode: createPlanMode ? "plan" : "default" });
        }
        recovery = "Reattach the files and retry";
        if (createAttachments.length > 0) {
          await materializeAttachments(path);
          // WorkspaceView's pending-send path bypasses its normal copy barrier.
          queuePending(id, { kind: "send", text, attachments: createAttachments.map(promptAttachment) });
        } else if (firstSession) {
          seedTranscript(id, firstSession.message);
          seededFirstMessage = true;
        }
      } catch (err) {
        // Creation succeeded: keep it reachable and editable without sending an
        // unconfirmed mode or missing path. Inline UTF-8 files need no copy.
        const inline = createAttachments.filter((attachment) => !attachment.staged).map(promptAttachment);
        queuePending(id, { kind: "draft", text, ...(inline.length ? { attachments: inline } : {}) });
        onWarning(`Workspace created, but the first message was not sent. ${recovery}: ${errorText(err)}`);
      }
      send({ type: "setup_detected", started: setupStarted });
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: ws });
      if (sectionId !== undefined) {
        // Assigning also unpins it (store `assignSection`); a section deleted meanwhile keeps the workspace unsectioned.
        if (canCreateIn(sectionsRef.current, sectionId)) dispatch({ type: "assignSection", workspaceId: id, sectionId });
        else onWarning(SECTION_ASSIGN_FAILED);
      }
      if (!dismissedAtLaunch) onClose();
      // Rename placeholder after first message. Skipped when queuePending was used (attachments
      // present) because WorkspaceView.submit handles the rename in that path.
      if (seededFirstMessage && firstSession) {
        const full = { ...ws, status: "idle" as const, diff: { added: 0, removed: 0 }, createdAt: Date.now() };
        void renameAfterFirstMessage(repo, full, firstSession.message, dispatch);
      }
    } catch (err) {
      const message = `${FAILED_TO_CREATE}: ${errorText(err)}`;
      if (dismissedAtLaunch) onWarning(message);
      else send({ type: "create_failed", error: message });
    } finally {
      removePendingLaunch(pendingId);
    }
  }

  /**
   * "Detecting setup script...": reads the repository's scripts config and
   * starts its setup script in the new worktree. A setup that fails to start
   * never blocks the workspace; the Setup tab offers Run setup.
   */
  async function startSetupScript(backendRepo: RepositoryDto, created: CreatedWorkspaceDto, targetBranch: string): Promise<boolean> {
    const { id, directoryName, path } = created.workspace;
    const ref = workspaceRef({ id: backendRepo.id, path: backendRepo.root, defaultBranch: backendRepo.defaultBranch }, { id, name: directoryName, path });
    if (!ref) return false;
    const workspace = { ...ref, targetBranch: targetBranch || null };
    try {
      if (!(await scriptsConfig(workspace)).setup) return false;
      watchSetup(id);
      const started = await startSetup(workspace);
      if (!started) unwatchSetup(id);
      return started;
    } catch {
      unwatchSetup(id);
      return false;
    }
  }

  /**
   * Conductor's "Add to backlog" (⌥↩, `workspace.addToBacklogFromComposer`):
   * creates the workspace without sending the first message, then marks it
   * backlog. The draft text is preserved as a workspace description but no
   * chat session is started until the user opens the workspace.
   *
   * Evidence: Hji.txt `ca` callback + `Ei` keydown capture handler.
   */
  async function addToBacklog() {
    if (busy || pendingFiles.current > 0 || !repo) return;
    const built = buildCreateRequest({ ...draft, firstMessage: composerPrompt(draft.firstMessage) }, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    const pendingId = crypto.randomUUID();
    addPendingLaunch(pendingId, repo.id);
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      const backendRepo = await ensureRepository(repo.path, repo.id);
      // Backlog workspaces are created idle — no first chat session even if the composer had text.
      const backlogRequest = { ...built.request, firstSession: null };
      const created = await createWorkspace(toCreateWorkspaceArgs({ ...backlogRequest, repoId: backendRepo.id }));
      send({ type: "created", workspaceId: created.workspace.id });
      if (created.upstreamWarning) onWarning(created.upstreamWarning);
      const backlogSetupStarted = await startSetupScript(backendRepo, created, built.request.targetBranch);
      try { await materializeAttachments(created.workspace.path); }
      catch (err) { onWarning(`Workspace created, but attachments could not be copied. Reattach the files: ${errorText(err)}`); }
      send({ type: "setup_detected", started: backlogSetupStarted });
      const { id, directoryName, branchName, path } = created.workspace;
      const { naming } = built.request;
      const ws = {
        id,
        name: directoryName,
        branch: branchName,
        path,
        targetBranch: built.request.targetBranch,
        placeholderBranchName: naming.placeholder_branch_name === null ? null : branchName,
        userSetWorkspaceName: naming.user_set_workspace_name,
        userSetBranchName: naming.user_set_branch_name,
        number: created.number ?? null,
        // GAP-SB-01: same lifecycle fix for backlog path.
        state: backlogSetupStarted ? "setting_up" : "ready",
      };
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: ws });
      dispatch({ type: "setWorkspaceStatus", repoId: repo.id, workspaceId: id, status: "backlog" });
      onClose();
    } catch (err) {
      send({ type: "create_failed", error: `${FAILED_TO_CREATE}: ${errorText(err)}` });
    } finally {
      removePendingLaunch(pendingId);
    }
  }

  // ComposerEditor fires the native KeyboardEvent directly (no React synthetic wrapper).
  function onKeyDown(e: globalThis.KeyboardEvent) {
    if (e.isComposing || suggestions.onKeyDown(e)) return;
    // ⌥↩ adds to backlog without opening a chat session (Conductor `workspace.addToBacklogFromComposer`).
    if (backlogKeys.some((s) => matchesEvent(s, e))) {
      e.preventDefault();
      e.stopPropagation();
      void addToBacklog();
      return;
    }
    if (submitKeys.some((s) => matchesEvent(s, e))) {
      e.preventDefault();
      void submit();
    } else if (newlineKeys.some((s) => matchesEvent(s, e))) {
      e.preventDefault();
      composerInputRef.current?.newline();
    }
  }

  const error = errors.repo ?? errors.baseBranch ?? errors.name ?? errors.from ?? attachError;
  const status = progress.step !== "idle" ? progressLabel(progress) : null;
  return (
    <form onSubmit={submit} className={`create-ws create-ws-${eyebrowVariant}`} aria-busy={busy} aria-label="composer">
      <div className="create-eyebrow">
        <RepoSelect
          repos={repos}
          value={draft.repoId}
          disabled={busy}
          invalid={!!errors.repo}
          shortcut={hint("workspace.create")}
          onChange={chooseRepo}
          addActions={addActions}
        />
        {repo && (
          <TargetBranchButton
            value={draft.baseBranch}
            defaultBranch={repo.defaultBranch ?? "main"}
            branches={branchSrc}
            disabled={busy}
            invalid={!!errors.baseBranch}
            onChange={(baseBranch) => setDraft((d) => ({ ...d, baseBranch }))}
            onRetry={() => setBranchAttempt((n) => n + 1)}
          />
        )}
        <span className="create-eyebrow-end">
          <CreateFromPicker
            value={draft.from}
            branches={branchSrc}
            defaultBranch={repo?.defaultBranch ?? null}
            repoPath={repo?.path ?? null}
            disabled={busy || !repo}
            shortcut={hint("workspace.createFromPRBranchIssue")}
            defaultOpen={fromOpen}
            onChange={(from) => {
              setDraft(selectFrom(draft, from));
              if (errors.from) setErrors({ ...errors, from: undefined });
            }}
          />
        </span>
      </div>
      {/* Hidden file input for the add-attachment picker. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          e.target.value = "";
          if (files.length > 0) void attachFiles(files);
        }}
      />
      <div className="create-card">
        {/* Hji/PQo: selected repository/ref suggestions exist before a workspace.
            Our local adapter reads immutable Git objects, not a workspace checkout.
            Binary files still use the existing draft-attachments barrier. */}
        <CreateWorkspaceSuggestions state={suggestions} />
        <div className="create-editor">
          <ComposerEditor
            inputRef={composerInputRef}
            value={draft.firstMessage}
            placeholder={CREATE_PLACEHOLDER}
            onChange={(v) => setDraft((d) => ({ ...d, firstMessage: v }))}
            onSelection={suggestions.onSelection}
            onKeyDown={onKeyDown}
            onFocus={suggestions.onFocus}
            onBlur={suggestions.onBlur}
            onPasteFiles={(files) => {
              if (files.length === 0) return false;
              void attachFiles(Array.from(files));
              return true;
            }}
          />
        </div>
        {createAttachments.length > 0 && (
          <div className="composer-attachments" aria-label="Attachments">
            {createAttachments.map((a) => (
              <ComposerAttachmentChip
                key={a.name}
                attachment={a}
                editorEpoch={attachPreviewEpoch}
                onRemove={() => {
                  if (busy) return;
                  if (a.staged) void draftAttachmentsApi.remove({ localWorkspaceId: draftWorkspaceId, relativePath: a.staged }).catch((err) => setAttachError(errorText(err)));
                  setCreateAttachments((list) => list.filter((x) => x.name !== a.name));
                  setAttachPreviewEpoch((n) => n + 1);
                }}
              />
            ))}
          </div>
        )}
        <div className="create-card-bar">
          <CreateModelPicker value={draft} favorites={favorites} slots={loadoutChoices(loadout?.slots ?? [])} settings={settings} disabled={busy} onChange={chooseLaunch} />
          <CreateAddMenu
            disabled={busy}
            hint={hint("chat.addAttachment") ?? ""}
            planHint={hint("chat.togglePlanMode") ?? ""}
            planMode={draft.agent === "claude" ? { isPlanMode: createPlanMode, disabled: busy, onToggle: toggleCreatePlanMode } : undefined}
            onAddAttachment={() => fileInputRef.current?.click()}
          />
          <div className="create-split" role="group" aria-label="Create workspace">
            <button
              type="submit"
              className="btn btn-primary btn-small create-submit"
              aria-label={choice.label}
              title={`${choice.sectionId === undefined ? "Create workspace" : choice.label} ${submitHint}`}
              data-split={choice.menu ? "true" : undefined}
              disabled={busy || !repo}
              data-primary-action
            >
              <span aria-hidden="true">{busy ? "Creating…" : choice.label}</span>
              <kbd aria-hidden="true">{submitHint}</kbd>
            </button>
            {choice.menu && (
              <button
                type="button"
                className="btn btn-primary btn-small create-split-toggle"
                aria-label={CREATE_IN_SECTION}
                title={CREATE_IN_SECTION}
                aria-haspopup="menu"
                aria-expanded={sectionMenuOpen}
                disabled={busy || !repo}
                onClick={() => setSectionMenuOpen((o) => !o)}
              >
                ▾
              </button>
            )}
            {choice.menu && sectionMenuOpen && (
              <div className="sb-menu create-split-menu" role="menu">
                <div className="create-split-heading">{CREATE_IN_SECTION}</div>
                {choice.menu.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="menuitem"
                    className="sb-menu-item"
                    disabled={busy}
                    onClick={() => {
                      setSectionMenuOpen(false);
                      void submit(undefined, s.id);
                    }}
                  >
                    <span>{s.emoji && <span aria-hidden="true" className="create-split-emoji">{s.emoji}</span>}{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {(error || status) && (
        <p className={error || progress.step === "failed" ? "error small create-status" : "muted small create-status"} role="status">
          {error ?? status}
        </p>
      )}
    </form>
  );
}

/**
 * Conductor's create composer model trigger: the chat composer's "Change agent"
 * picker (`RNi` inside `Hji`), with the loadout's favorites, "Add models" and
 * "Edit" (Settings › Default models) and the effort submenu, in place of two selects.
 */
/** H4b fix: Codex and Claude Code always present in the picker regardless of Loadout slots (B2). */
const CODEX_LAUNCH: LaunchPick = { model: "codex", effort: null, agent: "codex" };
const CLAUDE_LAUNCH: LaunchPick = { model: "claude-code", effort: null, agent: "claude" };

/**
 * The "+" add-attachment button in the create-composer footer.
 * Evidence: `a7i @7908848` — tooltip "Add attachments and more"; placed between
 * the model picker and Create in the `create-card-bar` footer.
 * GAP-COMP-04: adds planMode prop (REA a7i planMode wt path) with keyboard navigation
 * matching the main AddMenu.
 */
function CreateAddMenu({ disabled, hint, planHint, planMode, onAddAttachment }: { disabled: boolean; hint: string; planHint?: string; planMode?: PlanModeControl; onAddAttachment: () => void }) {
  const [open, setOpen] = useState(false);
  const popup = usePresence(open);
  const ref = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusEdge = useRef<"first" | "last" | null>(null);
  const menuItems = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  useLayoutEffect(() => {
    if (!open || focusEdge.current === null) return;
    const items = menuItems();
    (focusEdge.current === "first" ? items[0] : items[items.length - 1])?.focus();
    focusEdge.current = null;
  }, [open]);
  return (
    <span
      className="oc-add-menu"
      ref={ref}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={(e) => {
        if (e.nativeEvent?.isComposing) return;
        const arrow = e.key === "ArrowDown" || e.key === "ArrowUp";
        if (arrow || (open && (e.key === "Home" || e.key === "End"))) {
          e.preventDefault();
          e.stopPropagation();
          if (!open) {
            focusEdge.current = e.key === "ArrowDown" ? "first" : "last";
            setOpen(true);
          } else {
            const items = menuItems();
            if (items.length === 0) return;
            const current = items.findIndex((item) => item === e.target);
            let next = current + (e.key === "ArrowDown" ? 1 : -1);
            if (e.key === "Home") next = 0;
            else if (e.key === "End" || (current === -1 && e.key === "ArrowUp")) next = items.length - 1;
            items[(next + items.length) % items.length]?.focus();
          }
        } else if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <Tooltip content={<p>Add attachments and more</p>}>
        <button
          ref={triggerRef}
          type="button"
          className="oc-icon-btn oc-add-btn"
          aria-label="Add"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={disabled}
          onClick={(e) => {
            if (!open && e?.detail === 0) focusEdge.current = "first";
            setOpen((o) => !o);
          }}
        >
          <PlusIcon size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      {popup.mounted ? (
        <div className="oc-menu oc-add-popup" role="menu" data-motion="popup" {...popup.attrs}>
          <button
            type="button"
            role="menuitem"
            className="oc-menu-item"
            onClick={() => { setOpen(false); onAddAttachment(); }}
          >
            <PaperclipIcon size={16} />
            <span className="oc-menu-item-label">Add attachment</span>
            <span className="oc-kbd-hint">{hint}</span>
          </button>
          {planMode ? <button type="button" role="menuitem" className="oc-menu-item" disabled={planMode.disabled} title={planMode.disabled ? "Wait for the current Claude Code turn to end" : undefined} onClick={() => { setOpen(false); planMode.onToggle(); }}>
            <svg className={planMode.isPlanMode ? "oc-plan-active" : undefined} width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3M9 12l3 3L22 5" /></svg>
            <span className={`oc-menu-item-label${planMode.isPlanMode ? " oc-plan-active" : ""}`}>{planMode.isPlanMode ? "Exit plan mode" : "Plan mode"}</span>
            {planHint ? <span className="oc-kbd-hint">{planHint}</span> : null}
          </button> : null}
        </div>
      ) : null}
    </span>
  );
}

function CreateModelPicker({ value, favorites, slots, settings, disabled, onChange }: { value: LaunchModel; favorites: readonly LaunchPick[]; slots: readonly (import("../features/chat/composerModels").ModelChoice | null)[]; settings: Settings | null; disabled: boolean; onChange: (next: LaunchModel) => void }) {
  const allFavorites = useMemo<LaunchPick[]>(() => {
    const models = new Set(favorites.map((f) => f.model));
    return [
      ...favorites,
      ...(models.has(CODEX_LAUNCH.model) ? [] : [CODEX_LAUNCH]),
      ...(models.has(CLAUDE_LAUNCH.model) ? [] : [CLAUDE_LAUNCH]),
    ];
  }, [favorites]);
  return (
    <ModelPicker
      value={{ model: value.model, effort: value.effort || null, ...(value.agent === "reason" || value.agent === "claude" || value.agent === "codex" ? { agent: value.agent } : {}) }}
      favorites={allFavorites}
      loadout={slots}
      keybindingDialogIds={["dialog"]}
      itemAgent={(f) => f.agent ?? "reason"}
      itemLabel={(f) => modelLabel(f.model)}
      modelName={modelLabel}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => onChange(pickLaunch(value, next, settings))}
    />
  );
}
