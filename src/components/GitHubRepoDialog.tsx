import { useCallback, useEffect, useState, type FormEvent } from "react";
import { githubRepoAvailability, githubRepoCreate, githubRepoOwners } from "../backend";
import {
  canSubmit, dialogDescription, orgsErrorMessage, ownersErrorMessage, repoSlug, statusLine, submitLabel,
  type AvailabilityState, type GitHubOwners,
} from "../state/githubRepoDialog";
import { Modal } from "./Dialogs";

export interface GitHubRepoTarget {
  path: string;
  name: string;
  needsGitInit: boolean;
  existingOriginUrl?: string;
}

// Owners are cached for a day, but not when the organizations failed to load.
const DAY_MS = 24 * 60 * 60 * 1000;
let ownersCache: { at: number; value: GitHubOwners } | null = null;

async function loadOwners(force: boolean): Promise<GitHubOwners> {
  if (!force && ownersCache && Date.now() - ownersCache.at < DAY_MS) return ownersCache.value;
  const value = await githubRepoOwners();
  ownersCache = value.orgsError ? null : { at: Date.now(), value };
  return value;
}

type OwnersState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; value: GitHubOwners };

interface Props {
  target: GitHubRepoTarget;
  onClose: () => void;
  onOpenSettings: () => void;
  /** Called after the repo exists; adds the project. Errors surface as a toast. */
  onCreated: (originRemoteUrl: string) => Promise<void>;
  onError: (message: string) => void;
}

export function GitHubRepoDialog({ target, onClose, onOpenSettings, onCreated, onError }: Props) {
  const [owners, setOwners] = useState<OwnersState>({ kind: "loading" });
  const [owner, setOwner] = useState("");
  const [name, setName] = useState(() => repoSlug(target.name));
  const [availability, setAvailability] = useState<AvailabilityState>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const slug = repoSlug(name);

  const fetchOwners = useCallback((force: boolean) => {
    setOwners({ kind: "loading" });
    loadOwners(force).then(
      (value) => {
        setOwners({ kind: "ready", value });
        setOwner((cur) => cur || value.owners[0]?.login || "");
      },
      (err) => setOwners({ kind: "error", message: ownersErrorMessage(err instanceof Error ? err.message : String(err)) }),
    );
  }, []);
  useEffect(() => fetchOwners(false), [fetchOwners]);

  // Check the name 300 ms after typing stops; late answers for older names are ignored.
  useEffect(() => {
    if (!owner || !slug) return setAvailability({ kind: "idle" });
    setAvailability({ kind: "checking" });
    let live = true;
    const t = setTimeout(() => {
      githubRepoAvailability(owner, slug).then(
        (r) => live && setAvailability({ kind: r, slug }),
        () => live && setAvailability({ kind: "error", slug }),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [owner, slug]);

  const ready = owners.kind === "ready";
  const status = statusLine({ ownersLoading: owners.kind === "loading", slug, availability });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit(owner, slug, ready, availability, pending)) return;
    setPending(true);
    try {
      const created = await githubRepoCreate({ owner, repoPath: target.path, repositoryName: slug, existingOriginUrl: target.existingOriginUrl });
      await onCreated(created.originRemoteUrl);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <Modal title="Create a private GitHub repo?" onClose={onClose} motion="alert">
      <form onSubmit={submit} className="modal-body github-repo">
        <p className="muted">{dialogDescription(target.needsGitInit, target.existingOriginUrl)}</p>
        <label className="field">
          <span>Owner</span>
          <select value={owner} disabled={!ready || pending} onChange={(e) => setOwner(e.target.value)}>
            {!owner && <option value="">Select an owner</option>}
            {ready && owners.value.owners.map((o) => <option key={o.login} value={o.login}>{o.login}</option>)}
          </select>
        </label>
        {owners.kind === "error" && (
          <div className="github-repo-notice">
            <p className="error small">{owners.message}</p>
            <button type="button" className="btn btn-small" onClick={() => fetchOwners(true)}>Try again</button>
            <button type="button" className="btn btn-small" onClick={() => { onClose(); onOpenSettings(); }}>Open GitHub settings</button>
          </div>
        )}
        {ready && owners.value.orgsError && (
          <div className="github-repo-notice">
            <p className="muted small">{orgsErrorMessage(owners.value.orgsError)}</p>
            <button type="button" className="btn btn-small" onClick={() => fetchOwners(true)}>Try again</button>
          </div>
        )}
        <label className="field">
          <span>Repository name</span>
          <input value={name} disabled={pending} onChange={(e) => setName(e.target.value)} aria-invalid={status.tone === "error"} />
        </label>
        {owner && slug && <p className="muted small">Will create <code>{owner}/{slug}</code></p>}
        {owners.kind !== "error" && <p className={`small ${status.tone === "error" ? "error" : status.tone === "ok" ? "add" : "muted"}`} role="status">{status.text}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit(owner, slug, ready, availability, pending)}>
            {submitLabel(target.needsGitInit, pending)}
          </button>
        </div>
      </form>
    </Modal>
  );
}
