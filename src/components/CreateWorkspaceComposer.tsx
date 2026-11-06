import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent } from "react";
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
import { listFavorites } from "../settings/agents/api";
import { displayedLoadout, parseFavorites } from "../settings/agents/loadout";
import { CreateFromPicker } from "./CreateFromPicker";
import { getSettings } from "../settings/api";
import type { Settings } from "../settings/types";
import { modelLabel } from "../settings/models";
import type { AddRepositoryActions } from "./AddRepositoryMenu";
import { RepoSelect } from "./create/RepoSelect";
import { TargetBranchButton } from "./create/TargetBranchButton";
import { useKeybindingOverrides } from "../keybindings/KeybindingsProvider";
import { effectiveShortcuts } from "../keybindings/overrides";
import { glyphs, matchesEvent } from "../keybindings/shortcut";
import type { NavSection } from "../state/navigationSections";
import { CREATE_IN_SECTION, SECTION_ASSIGN_FAILED, canCreateIn, sectionChoice } from "../workspace/createInSection";

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
  /** Creation started or settled; the dialog keeps itself open while busy. */
  onBusyChange?: (busy: boolean) => void;
  /** The repo picker's "Add project" menu: Open project, Open GitHub project, Quick start, Recents. */
  addActions: AddRepositoryActions;
  /** A non-fatal issue while creating the workspace; the workspace still opens. */
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [favorites, setFavorites] = useState<LaunchPick[]>([]);
  const [draft, setDraft] = useState<CreateDraft>(() =>
    newDraft({ repoId: startRepo?.id ?? null, defaultBranch: startRepo?.defaultBranch ?? "main", cityName: suggestName(startRepo)?.name ?? "", ...launchDefaults(null) }),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [branchSrc, setBranchSrc] = useState<SourceState<BranchDto>>({ status: "loading" });
  const [progress, send] = useReducer(reduceProgress, { step: "idle" });
  const repo = repos.find((r) => r.id === draft.repoId);
  const prefix = useMemo(() => resolveBranchPrefix(prefixSettings, githubUsername), [prefixSettings, githubUsername]);
  const [branchAttempt, setBranchAttempt] = useState(0);
  const busy = progress.step === "creating" || progress.step === "detecting_setup";
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  const { overrides } = useKeybindingOverrides();
  const submitKeys = [...effectiveShortcuts("chat.submitMessage", overrides), ...effectiveShortcuts("chat.submitOppositeFollowUp", overrides)];
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
    let live = true;
    getSettings().then(
      (s) => {
        if (!live) return;
        setSettings(s);
        setDraft((d) => ({ ...d, ...launchDefaults(s) }));
        // Conductor lists the loadout (slot 1 is the default model) as the picker's favorites.
        listFavorites().then(
          (rows) => live && setFavorites(loadoutPicks(displayedLoadout(s, parseFavorites(rows)))),
          () => live && setFavorites(loadoutPicks(displayedLoadout(s, []))),
        );
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

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

  function chooseRepo(id: string) {
    const next = repos.find((r) => r.id === id);
    setDraft((d) => {
      const name = d.nameEdited ? null : suggestName(next);
      return { ...selectFrom(d, null), repoId: id, baseBranch: next?.defaultBranch ?? "main", name: name?.name ?? d.name };
    });
    setErrors({});
  }

  function chooseLaunch(next: LaunchModel) {
    setDraft((d) => ({ ...d, ...next }));
  }

  async function submit(e?: FormEvent, sectionId: string | undefined = choice.sectionId) {
    e?.preventDefault();
    if (busy || !repo || !canCreateIn(sectionsRef.current, sectionId)) return;
    const built = buildCreateRequest(draft, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    // The sidebar shows an "Untitled" initializing row in this repo until the workspace is added or fails.
    const pendingId = crypto.randomUUID();
    addPendingLaunch(pendingId, repo.id);
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      const backendRepo = await ensureRepository(repo.path, repo.id);
      const created = await createWorkspace(toCreateWorkspaceArgs({ ...built.request, repoId: backendRepo.id }));
      send({ type: "created", workspaceId: created.workspace.id });
      if (created.upstreamWarning) onWarning(created.upstreamWarning);
      send({ type: "setup_detected", started: await startSetupScript(backendRepo, created, built.request.targetBranch) });
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
      };
      // The first message opens the workspace's first chat session.
      if (firstSession) {
        configureReason(id, sessionConfig(firstSession.model, firstSession.effort));
        seedTranscript(id, firstSession.message);
      }
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: ws });
      if (sectionId !== undefined) {
        // Assigning also unpins it (store `assignSection`); a section deleted meanwhile keeps the workspace unsectioned.
        if (canCreateIn(sectionsRef.current, sectionId)) dispatch({ type: "assignSection", workspaceId: id, sectionId });
        else onWarning(SECTION_ASSIGN_FAILED);
      }
      onClose();
      // ...and renames a placeholder city workspace after it.
      if (firstSession) {
        const full = { ...ws, status: "idle" as const, diff: { added: 0, removed: 0 }, createdAt: Date.now() };
        void renameAfterFirstMessage(repo, full, firstSession.message, dispatch);
      }
    } catch (err) {
      send({ type: "create_failed", error: `${FAILED_TO_CREATE}: ${errorText(err)}` });
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

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    // `chat.newLine` (Shift+Enter, or Enter under the ⌘Enter preset) falls through to the textarea.
    if (submitKeys.some((s) => matchesEvent(s, e.nativeEvent))) {
      e.preventDefault();
      void submit();
    }
  }

  const error = errors.repo ?? errors.baseBranch ?? errors.name ?? errors.from;
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
      <div className="create-card">
        <textarea
          autoFocus
          aria-label="First message"
          className="create-editor"
          value={draft.firstMessage}
          placeholder={CREATE_PLACEHOLDER}
          onChange={(e) => setDraft({ ...draft, firstMessage: e.target.value })}
          onKeyDown={onKeyDown}
          disabled={busy}
        />
        <div className="create-card-bar">
          <CreateModelPicker value={draft} favorites={favorites} settings={settings} disabled={busy} onChange={chooseLaunch} />
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
function CreateModelPicker({ value, favorites, settings, disabled, onChange }: { value: LaunchModel; favorites: readonly LaunchPick[]; settings: Settings | null; disabled: boolean; onChange: (next: LaunchModel) => void }) {
  return (
    <ModelPicker
      value={{ model: value.model, effort: value.effort || null }}
      favorites={favorites}
      itemLabel={(f) => modelLabel(f.model)}
      modelName={modelLabel}
      disabled={disabled}
      onOpenSettings={() => openSettingsPage("models")}
      onChange={(next) => onChange(pickLaunch(value, next, settings))}
    />
  );
}
