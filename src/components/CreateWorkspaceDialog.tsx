import { useEffect, useMemo, useReducer, useState, type Dispatch, type FormEvent } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { Modal } from "./Dialogs";
import { seedTranscript } from "./WorkspaceView";
import { configureReason } from "../features/chat/reasonChat";
import { sessionConfig } from "../features/chat/chatModel";
import { RARITY_LABEL, generateWorkspaceNames, resolveBranchPrefix, type BranchPrefixSettings, type GeneratedName } from "../workspace/naming";
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
import { CreateFromPicker } from "./CreateFromPicker";
import { getSettings } from "../settings/api";
import { newChatModel } from "../settings/models";
import { AddRepositoryMenu } from "./AddRepositoryMenu";

interface Props {
  repos: Repo[];
  initialRepoId: string | null;
  /** `branch_prefix_type` / `branch_prefix` settings. */
  prefixSettings: BranchPrefixSettings;
  githubUsername: string | null;
  onClose: () => void;
  onAddRepository: () => void;
  /** A non-fatal issue while creating the workspace; the workspace still opens. */
  onWarning: (message: string) => void;
  dispatch: Dispatch<Action>;
}

// Until settings load; then the first chat uses Settings › Default models.
const AGENT = { agent: "claude", model: "opus", effort: "high" };

function suggestName(repo: Repo | undefined, branches: string[] = []): GeneratedName | null {
  if (!repo) return null;
  const taken = [...repo.workspaces.flatMap((w) => [w.name, w.branch]), ...branches.map((b) => b.replace(/^.*\//, ""))];
  return generateWorkspaceNames(1, taken, Math.random)[0];
}

export function CreateWorkspaceDialog({ repos, initialRepoId, prefixSettings, githubUsername, onClose, onAddRepository, onWarning, dispatch }: Props) {
  const startRepo = repos.find((r) => r.id === initialRepoId) ?? repos[0];
  const [city, setCity] = useState(() => suggestName(startRepo));
  const [draft, setDraft] = useState<CreateDraft>(() =>
    newDraft({ repoId: startRepo?.id ?? null, defaultBranch: startRepo?.defaultBranch ?? "main", cityName: city?.name ?? "", ...AGENT }),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [branchSrc, setBranchSrc] = useState<SourceState<BranchDto>>({ status: "loading" });
  const branches = branchSrc.status === "ready" ? branchSrc.items.map((b) => b.name) : [];
  const [progress, send] = useReducer(reduceProgress, { step: "idle" });
  const repo = repos.find((r) => r.id === draft.repoId);
  const prefix = useMemo(() => resolveBranchPrefix(prefixSettings, githubUsername), [prefixSettings, githubUsername]);
  const [cloning, setCloning] = useState(false);
  const busy = progress.step === "creating" || progress.step === "detecting_setup" || cloning;
  // A freshly cloned repo gets its id in the store; select it once it shows up.
  const [pendingRepoPath, setPendingRepoPath] = useState<string | null>(null);
  useEffect(() => {
    const added = pendingRepoPath ? repos.find((r) => r.path === pendingRepoPath) : undefined;
    if (!added) return;
    setPendingRepoPath(null);
    chooseRepo(added.id);
  }, [repos, pendingRepoPath]);

  const addRepository = (label: string, primary = false) => (
    <AddRepositoryMenu
      repos={repos}
      label={label}
      primary={primary}
      disabled={busy}
      onOpenProject={onAddRepository}
      onBusyChange={setCloning}
      onCloned={(cloned, source) => {
        dispatch({ type: "addRepo", repo: { name: source.name, path: cloned.root, remote: source.url, defaultBranch: cloned.defaultBranch } });
        setPendingRepoPath(cloned.root);
      }}
    />
  );

  useEffect(() => {
    let live = true;
    getSettings().then((s) => live && setDraft((d) => ({ ...d, ...newChatModel(s) })), () => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!repo?.path) return setBranchSrc({ status: "ready", items: [{ name: repo?.defaultBranch ?? "main", remote: null, commit: "", isHead: true, committedAt: 0 }] });
    let live = true;
    setBranchSrc({ status: "loading" });
    ensureRepository(repo.path)
      .then((r) => listBranches(r.id, repo.defaultBranch))
      .then((list) => {
        if (!live) return;
        const names = list.map((b) => b.name);
        setBranchSrc({ status: "ready", items: list });
        // Re-roll an untouched placeholder that collides with an existing branch.
        setDraft((d) => {
          if (d.nameEdited || !names.some((b) => b.replace(/^.*\//, "") === d.name)) return d;
          const next = suggestName(repo, names);
          if (next) setCity(next);
          return next ? { ...d, name: next.name } : d;
        });
      })
      .catch((e) => live && setBranchSrc({ status: "error", message: errorText(e) }));
    return () => {
      live = false;
    };
  }, [repo?.id]);

  function chooseRepo(id: string) {
    const next = repos.find((r) => r.id === id);
    const name = draft.nameEdited ? null : suggestName(next);
    if (name) setCity(name);
    setDraft({ ...selectFrom(draft, null), repoId: id, baseBranch: next?.defaultBranch ?? "main", name: name?.name ?? draft.name });
    setErrors({});
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy || !repo) return;
    const built = buildCreateRequest(draft, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    // The sidebar shows an "Untitled" initializing row in this repo until the workspace is added or fails.
    const pendingId = crypto.randomUUID();
    addPendingLaunch(pendingId, repo.id);
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      const backendRepo = await ensureRepository(repo.path);
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
        placeholderBranchName: naming.placeholder_branch_name === null ? null : branchName,
        userSetWorkspaceName: naming.user_set_workspace_name,
        userSetBranchName: naming.user_set_branch_name,
        number: created.number ?? null,
      };
      // The first message opens the workspace's first chat session (agent runtime pending).
      if (firstSession) {
        configureReason(id, sessionConfig(firstSession.model, firstSession.effort));
        seedTranscript(id, firstSession.message);
      }
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: ws });
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

  if (repos.length === 0) {
    return (
      <Modal title="New workspace" onClose={onClose}>
        <div className="modal-body">
          <p className="muted">Add a repository first. Each workspace is a git worktree of one repository.</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
            {addRepository("Add repository", true)}
          </div>
        </div>
      </Modal>
    );
  }

  const branchOptions = branches.includes(draft.baseBranch) ? branches : [draft.baseBranch, ...branches];
  return (
    <Modal title="New workspace" onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="modal-body create-ws">
        <div className="composer create-composer">
          <textarea
            autoFocus
            rows={4}
            value={draft.firstMessage}
            placeholder="What should the agent work on? (optional)"
            onChange={(e) => setDraft({ ...draft, firstMessage: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && submit()}
          />
        </div>
        <CreateFromPicker
          value={draft.from}
          branches={branchSrc}
          repoPath={repo?.path ?? null}
          disabled={busy}
          error={errors.from}
          onChange={(from) => {
            setDraft(selectFrom(draft, from));
            if (errors.from) setErrors({ ...errors, from: undefined });
          }}
        />
        <div className="create-row">
          <label className="field">
            <span>Repository</span>
            <div className="field-row">
              <select value={draft.repoId ?? ""} onChange={(e) => chooseRepo(e.target.value)} disabled={busy} aria-invalid={!!errors.repo}>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {addRepository("Add…")}
            </div>
            {errors.repo && <span className="error small">{errors.repo}</span>}
          </label>
          <label className="field">
            <span>Base branch</span>
            <select value={draft.baseBranch} onChange={(e) => setDraft({ ...draft, baseBranch: e.target.value })} disabled={busy} aria-invalid={!!errors.baseBranch}>
              {branchOptions.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {errors.baseBranch && <span className="error small">{errors.baseBranch}</span>}
          </label>
        </div>
        <label className="field">
          <span>
            Workspace name
            {city && !draft.nameEdited && <span className={`rarity rarity-${city.city.rarity}`}>{RARITY_LABEL[city.city.rarity]}</span>}
          </span>
          <input
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value, nameEdited: true });
              if (errors.name) setErrors({ ...errors, name: undefined });
            }}
            disabled={busy}
            aria-invalid={!!errors.name}
          />
          {errors.name ? (
            <span className="error small">{errors.name}</span>
          ) : (
            <span className="muted small">
              {draft.from?.kind === "pr" || draft.from?.kind === "branch" ? (
                <>Checks out <code>{draft.from.kind === "pr" ? draft.from.headBranch : draft.from.name}</code>.</>
              ) : (
                <>Branch <code>{prefix}{draft.name.trim() || "…"}</code>. A placeholder name is replaced by a generated branch name after the first message.</>
              )}
            </span>
          )}
        </label>
        {progress.step !== "idle" && (
          <p className={progress.step === "failed" ? "error small" : "muted small"} role="status">
            {progressLabel(progress)}
          </p>
        )}
        <div className="modal-actions">
          <span className="muted small create-hint">⌘↵ to create</span>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </Modal>
  );
}
