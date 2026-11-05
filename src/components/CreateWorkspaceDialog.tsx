import { useEffect, useMemo, useReducer, useState, type Dispatch, type FormEvent } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { Modal } from "./Dialogs";
import { seedTranscript } from "./WorkspaceView";
import { newId } from "../state/names";
import { RARITY_LABEL, generateWorkspaceNames, resolveBranchPrefix, type BranchPrefixSettings, type GeneratedName } from "../workspace/naming";
import {
  FAILED_TO_CREATE,
  buildCreateRequest,
  newDraft,
  progressLabel,
  reduceProgress,
  toCreateWorkspaceArgs,
  type CreateDraft,
  type DraftErrors,
} from "../workspace/createFlow";
import { createWorkspace, ensureRepository, errorText, listBranches } from "../workspace/api";

interface Props {
  repos: Repo[];
  initialRepoId: string | null;
  /** `branch_prefix_type` / `branch_prefix_custom` settings. */
  prefixSettings: BranchPrefixSettings;
  githubUsername: string | null;
  onClose: () => void;
  onAddRepository: () => void;
  dispatch: Dispatch<Action>;
}

const AGENT = { agent: "claude", model: "opus", effort: "high" };

function suggestName(repo: Repo | undefined, branches: string[] = []): GeneratedName | null {
  if (!repo) return null;
  const taken = [...repo.workspaces.flatMap((w) => [w.name, w.branch]), ...branches.map((b) => b.replace(/^.*\//, ""))];
  return generateWorkspaceNames(1, taken, Math.random)[0];
}

export function CreateWorkspaceDialog({ repos, initialRepoId, prefixSettings, githubUsername, onClose, onAddRepository, dispatch }: Props) {
  const startRepo = repos.find((r) => r.id === initialRepoId) ?? repos[0];
  const [city, setCity] = useState(() => suggestName(startRepo));
  const [draft, setDraft] = useState<CreateDraft>(() =>
    newDraft({ repoId: startRepo?.id ?? null, defaultBranch: startRepo?.defaultBranch ?? "main", cityName: city?.name ?? "", ...AGENT }),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [branches, setBranches] = useState<string[]>([]);
  const [progress, send] = useReducer(reduceProgress, { step: "idle" });
  const repo = repos.find((r) => r.id === draft.repoId);
  const prefix = useMemo(() => resolveBranchPrefix(prefixSettings, githubUsername), [prefixSettings, githubUsername]);
  const busy = progress.step === "creating" || progress.step === "detecting_setup" || progress.step === "running_setup";

  useEffect(() => {
    if (!repo?.path) return setBranches([repo?.defaultBranch ?? "main"]);
    let live = true;
    ensureRepository(repo.path)
      .then((r) => listBranches(r.id, repo.defaultBranch))
      .then((list) => {
        if (!live) return;
        const names = list.map((b) => b.name);
        setBranches(names);
        // Re-roll an untouched placeholder that collides with an existing branch.
        setDraft((d) => {
          if (d.nameEdited || !names.some((b) => b.replace(/^.*\//, "") === d.name)) return d;
          const next = suggestName(repo, names);
          if (next) setCity(next);
          return next ? { ...d, name: next.name } : d;
        });
      })
      .catch(() => live && setBranches([repo.defaultBranch]));
    return () => {
      live = false;
    };
  }, [repo?.id]);

  function chooseRepo(id: string) {
    const next = repos.find((r) => r.id === id);
    const name = draft.nameEdited ? null : suggestName(next);
    if (name) setCity(name);
    setDraft({ ...draft, repoId: id, baseBranch: next?.defaultBranch ?? "main", name: name?.name ?? draft.name });
    setErrors({});
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy || !repo) return;
    const built = buildCreateRequest(draft, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      const backendRepo = await ensureRepository(repo.path);
      const created = await createWorkspace(toCreateWorkspaceArgs({ ...built.request, repoId: backendRepo.id }));
      send({ type: "created", workspaceId: created.workspace.id });
      // No setup-script command in the backend yet: detection finds none.
      send({ type: "setup_detected", hasScript: false });
      const id = newId();
      // The first message opens the workspace's first chat session (agent runtime pending).
      if (built.request.firstSession) seedTranscript(id, built.request.firstSession.message);
      const { directoryName, branchName, path } = created.workspace;
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: { id, name: directoryName, branch: branchName, path } });
      onClose();
    } catch (err) {
      send({ type: "create_failed", error: `${FAILED_TO_CREATE}: ${errorText(err)}` });
    }
  }

  if (repos.length === 0) {
    return (
      <Modal title="New workspace" onClose={onClose}>
        <div className="modal-body">
          <p className="muted">Add a repository first. Each workspace is a git worktree of one repository.</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onAddRepository}>Add repository</button>
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
        <div className="create-row">
          <label className="field">
            <span>Repository</span>
            <div className="field-row">
              <select value={draft.repoId ?? ""} onChange={(e) => chooseRepo(e.target.value)} disabled={busy} aria-invalid={!!errors.repo}>
                {repos.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn-small" onClick={onAddRepository} disabled={busy}>Add…</button>
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
              Branch <code>{prefix}{draft.name.trim() || "…"}</code>. A placeholder name is replaced by a generated branch name after the first message.
            </span>
          )}
        </label>
        {progress.step !== "idle" && (
          <p className={progress.step === "failed" || progress.step === "setup_failed" ? "error small" : "muted small"} role="status">
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
