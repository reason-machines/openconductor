import { useEffect, useState, type FormEvent } from "react";
import { folderExists, githubGitProtocol, githubRecentRepos, lastCloneDirectory, pickFolder, saveLastCloneDirectory } from "../backend";
import { cloneRepository, defaultCloneDirectory, type RepositoryDto } from "../workspace/api";
import {
  appendLog, canClone, cloneButtonLabel, cloneErrorMessage, cloneTargetName, initialLocation, isSelectedRepo, logText,
  recentRepoUrl, urlPlaceholder, validateClone, type GitProtocol, type RecentRepo,
} from "../state/cloneDialog";
import { DialogFrame } from "./DialogFrame";

// "Clone GitHub repo" (evidence/screens/clone-dialog.md). Recent repos are
// cached for 2 minutes, like the reference.
const RECENT_TTL_MS = 2 * 60 * 1000;
let recentCache: { at: number; value: RecentRepo[] } | null = null;

async function loadRecentRepos(): Promise<RecentRepo[]> {
  if (recentCache && Date.now() - recentCache.at < RECENT_TTL_MS) return recentCache.value;
  const value = await githubRecentRepos();
  recentCache = { at: Date.now(), value };
  return value;
}

interface Props {
  onClose: () => void;
  /** Called with the cloned checkout; adds the project. */
  onCloned: (repo: RepositoryDto, remoteUrl: string, name: string) => void;
}

export function CloneGitHubRepoDialog({ onClose, onCloned }: Props) {
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [protocol, setProtocol] = useState<GitProtocol | undefined>();
  const [recent, setRecent] = useState<RecentRepo[] | "loading" | null>("loading");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    githubGitProtocol().then((p) => live && setProtocol(p), () => undefined);
    loadRecentRepos().then((r) => live && setRecent(r), () => live && setRecent(null));
    (async () => {
      const saved = await lastCloneDirectory();
      const exists = saved ? await folderExists(saved) : false;
      const fallback = await defaultCloneDirectory().catch(() => "");
      if (live) setLocation((cur) => cur || initialLocation(saved, exists, fallback));
    })();
    return () => {
      live = false;
    };
  }, []);

  async function browse() {
    const picked = await pickFolder("Choose where to clone the repository", location);
    if (picked) setLocation(picked);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (pending) return;
    setError(null);
    const remoteUrl = url.trim();
    const target = location.trim();
    const invalid = validateClone(remoteUrl, target);
    if (invalid) return setError(invalid);
    setPending(true);
    try {
      const name = cloneTargetName(remoteUrl);
      const repo = await cloneRepository(remoteUrl, target, name, (line) => setLog((l) => appendLog(l, line)));
      saveLastCloneDirectory(target);
      setUrl("");
      setLog([]);
      onCloned(repo, remoteUrl, name);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(cloneErrorMessage({ errorMessage: message, remoteUrl, prefersSshUrls: protocol === "ssh" }));
      setLog([]);
      setPending(false);
    }
  }

  return (
    <DialogFrame kind="dialog" className="clone-project-modal" titleId="clone-project-title" descriptionId="clone-project-description" onClose={onClose}>
      <div className="project-dialog-header">
        <h2 id="clone-project-title">Clone GitHub repo</h2>
        <p id="clone-project-description" className="sr-only">Choose a recent repo or paste a clone URL.</p>
      </div>
      <form onSubmit={submit} className="modal-body clone-dialog">
        <label className="field">
          <span>Repository URL</span>
          <input
            id="git-url" autoFocus autoComplete="off" spellCheck={false} value={url}
            placeholder={urlPlaceholder(protocol)} onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        {recent && (recent === "loading" || recent.length > 0) && (
          <div className="clone-recent">
            <span className="clone-recent-heading">Recent repos</span>
            {recent === "loading" ? (
              <div role="status">
                <span className="sr-only">Loading recent repos</span>
                {[0, 1, 2].map((i) => <div key={i} className="clone-recent-skeleton" />)}
              </div>
            ) : (
              <ul className="clone-recent-list">
                {recent.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button" disabled={pending} aria-pressed={isSelectedRepo(r, url)}
                      className={isSelectedRepo(r, url) ? "selected" : ""} onClick={() => setUrl(recentRepoUrl(r, protocol))}
                    >
                      {r.owner.avatar_url ? <img src={r.owner.avatar_url} alt="" /> : <span className="clone-avatar" />}
                      <span className="clone-recent-name">{r.full_name}</span>
                      {r.description && <span className="clone-recent-desc">{r.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <label className="field">
          <span>Location</span>
          <div className="field-row">
            <input value={location} placeholder="Enter path or click to select" onChange={(e) => setLocation(e.target.value)} />
            <button type="button" className="btn" disabled={pending} onClick={() => void browse()}>Browse</button>
          </div>
        </label>
        {pending && log.length > 0 && (
          <div className="clone-progress">
            <span className="clone-progress-label"><span className="clone-spinner" aria-hidden />Cloning...</span>
            <pre className="clone-log">{logText(log)}</pre>
          </div>
        )}
        {error && <div className="clone-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="btn btn-primary" data-primary-action disabled={!canClone(url.trim(), location.trim(), pending)}>
            {cloneButtonLabel(pending)}
            {!pending && <kbd className="clone-kbd">⌘↵</kbd>}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}
