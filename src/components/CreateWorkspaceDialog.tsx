import { useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type FormEvent } from "react";
import type { Repo } from "../state/types";
import type { Action } from "../state/store";
import { Modal } from "./Dialogs";
import { seedTranscript } from "./WorkspaceView";
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
  type CreateEvent,
  type DraftErrors,
} from "../workspace/createFlow";
import { createWorkspace, ensureRepository, errorText, listBranches, restartSetup, startSetup, type BranchDto } from "../workspace/api";
import { setupFeed, setupRef } from "../workspace/setupOnCreate";
import type { WorkspaceRef } from "../scripts/model";
import { renameAfterFirstMessage } from "../workspace/firstMessage";
import type { SourceState } from "../workspace/createFrom";
import { CreateFromPicker } from "./CreateFromPicker";

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
  const [branchSrc, setBranchSrc] = useState<SourceState<BranchDto>>({ status: "loading" });
  const branches = branchSrc.status === "ready" ? branchSrc.items.map((b) => b.name) : [];
  const [progress, send] = useReducer(reduceProgress, { step: "idle" });
  const repo = repos.find((r) => r.id === draft.repoId);
  const prefix = useMemo(() => resolveBranchPrefix(prefixSettings, githubUsername), [prefixSettings, githubUsername]);
  const busy = progress.step === "creating" || progress.step === "detecting_setup" || progress.step === "running_setup";
  // Setup of the workspace just created: its ref, the event listener, and the kept log file.
  const setup = useRef<{ ref: WorkspaceRef; stop: () => void } | null>(null);
  const [setupLog, setSetupLog] = useState<string | null>(null);
  useEffect(() => () => setup.current?.stop(), []);
  useEffect(() => {
    if (progress.step === "ready" && setup.current) leave();
  }, [progress.step]);

  /** Close the dialog; a setup script still running keeps running in the backend. */
  function leave() {
    setup.current?.stop();
    setup.current = null;
    onClose();
  }

  /** Runs the repository setup script in the new workspace; closes the dialog when there is none. */
  async function runSetup(repoInfo: { id: string; root: string; defaultBranch: string }, ws: { id: string; directoryName: string; path: string; branchName: string }) {
    const ref = setupRef(repoInfo, ws);
    const feed = setupFeed(ws.id);
    // Output can arrive before `setup_script_start` returns; hold it until detection is recorded.
    let held: CreateEvent[] | null = [];
    const deliver = (events: CreateEvent[]) => (held ? held.push(...events) : events.forEach(send));
    try {
      const handle = await startSetup(ref, (ev) => {
        deliver(feed.push(ev));
        if (ev.type === "setupFinished" && ev.workspaceId === ws.id) setSetupLog(feed.logPath());
      });
      send({ type: "setup_detected", hasScript: handle.started });
      if (!handle.started) {
        handle.stop();
        return onClose();
      }
      setup.current = { ref, stop: handle.stop };
    } catch (err) {
      send({ type: "setup_detected", hasScript: true });
      held = [...held, { type: "setup_output", line: errorText(err) }, { type: "setup_exited", exitCode: null }];
    }
    const pending = held;
    held = null;
    pending.forEach(send);
  }

  async function retrySetup() {
    if (!setup.current) return;
    send({ type: "retry_setup" });
    setSetupLog(null);
    try {
      if (!(await restartSetup(setup.current.ref))) send({ type: "setup_exited", exitCode: 0 });
    } catch (err) {
      send({ type: "setup_output", line: errorText(err) });
      send({ type: "setup_exited", exitCode: null });
    }
  }

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
    if (busy || !repo || (progress.step !== "idle" && progress.step !== "failed")) return;
    const built = buildCreateRequest(draft, prefix);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    send({ type: "submit" });
    try {
      if (!repo.path) throw new Error("This repository has no local checkout yet.");
      const backendRepo = await ensureRepository(repo.path);
      const created = await createWorkspace(toCreateWorkspaceArgs({ ...built.request, repoId: backendRepo.id }));
      send({ type: "created", workspaceId: created.workspace.id });
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
      };
      // The first message opens the workspace's first chat session (agent runtime pending).
      if (firstSession) seedTranscript(id, firstSession.message);
      dispatch({ type: "addWorkspace", repoId: repo.id, workspace: ws });
      // ...and renames a placeholder city workspace after it.
      if (firstSession) {
        const full = { ...ws, status: "idle" as const, diff: { added: 0, removed: 0 }, createdAt: Date.now() };
        void renameAfterFirstMessage(repo, full, firstSession.message, dispatch);
      }
      await runSetup(backendRepo, created.workspace);
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
        <CreateFromPicker
          value={draft.from}
          branches={branchSrc}
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
              {draft.from?.kind === "pr" || draft.from?.kind === "branch" ? (
                <>Checks out <code>{draft.from.kind === "pr" ? draft.from.headBranch : draft.from.name}</code>.</>
              ) : (
                <>Branch <code>{prefix}{draft.name.trim() || "…"}</code>. A placeholder name is replaced by a generated branch name after the first message.</>
              )}
            </span>
          )}
        </label>
        {progress.step !== "idle" && (
          <p className={progress.step === "failed" || progress.step === "setup_failed" ? "error small" : "muted small"} role="status">
            {progressLabel(progress)}
            {progress.step === "setup_failed" && progress.exitCode !== null && ` (exit ${progress.exitCode})`}
          </p>
        )}
        {(progress.step === "running_setup" || progress.step === "setup_failed") && (
          <div className="setup-log">
            <pre className="small" aria-label="Setup output">{progress.log.slice(-20).join("\n") || "Waiting for output…"}</pre>
            {setupLog && <span className="muted small">Log: <code>{setupLog}</code></span>}
          </div>
        )}
        <div className="modal-actions">
          {progress.step === "running_setup" ? (
            <button type="button" className="btn" onClick={leave}>Continue in background</button>
          ) : progress.step === "setup_failed" ? (
            <>
              <button type="button" className="btn" onClick={() => void retrySetup()}>Retry setup</button>
              <button type="button" className="btn btn-primary" onClick={leave}>Open workspace</button>
            </>
          ) : (
            <>
              <span className="muted small create-hint">⌘↵ to create</span>
              <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create"}</button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
