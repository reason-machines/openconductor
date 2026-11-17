// Repository Settings › Git, row for row with Conductor 0.87.6's workspace-scope
// git rows (renderApp-D_fmY7hW.js, registry `Dga`): "Branch new workspaces
// from" and "Remote origin" (stacked pickers), then the `[git]` flags a
// repository may override: Delete branch on archive, Archive on merge, Set
// upstream on plain git push. The flags are written to the repository's
// `.conductor/settings.local.toml`; archive reads them through the effective
// settings (workspace_archive_commands.rs, useArchiveOnMerge.ts).
import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { Menu } from "@base-ui/react/menu";
import { EllipsisIcon } from "../../components/menu/menuIcons";
import "../../components/sidebarActionsMenu.css";
import type { Repo } from "../../state/types";
import { Toggle } from "../controls";
import { Row } from "../GeneralPage";
import { repoSettingsSetLocal, type RepoLocalKey } from "../repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings.ts";

const GITHUB_AUTO_DELETE_DOCS =
  "https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches";

/** Mount on the repository Git page (`/settings/repos/$repoId/git`). */
export function RepoGitRows({ repo }: { repo: Repo }) {
  const effective = useRepoSettings(repo.path || undefined);
  const [error, setError] = useState<string | null>(null);
  const git = effective?.git;
  const set = (key: RepoLocalKey, on: boolean | null) => {
    if (!repo.path) return;
    setError(null);
    repoSettingsSetLocal(repo.path, key, on).then(notifyRepoSettingsChanged, () => setError(on === null ? "Failed to reset the setting" : "Failed to save the setting"));
  };
  const remote = repo.remote || "origin";
  const branch = repo.defaultBranch || "main";
  const repoBranches = useRepoBranches(repo.id);
  const remoteBranchNames = repoBranches.filter((b) => b.remote !== null).map((b) => b.name);
  const remoteNames = [...new Set(repoBranches.flatMap((b) => (b.remote ? [b.remote] : [])))];
  const [localBranch, setLocalBranch] = useState(`${remote}/${branch}`);
  const [localRemote, setLocalRemote] = useState(remote);
  const [pickerError, setPickerError] = useState<string | null>(null);
  useEffect(() => {
    setLocalBranch(`${repo.remote || "origin"}/${repo.defaultBranch || "main"}`);
    setLocalRemote(repo.remote || "origin");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.id]);
  const flag = (label: string, key: RepoLocalKey, value: boolean | undefined, fallback: boolean) => (
    <Toggle label={label} checked={value ?? fallback} disabled={!git} onChange={(on) => set(key, on)} />
  );
  const saveBranch = (picked: string) => {
    setLocalBranch(picked);
    const r = repoBranches.find((b) => b.name === picked)?.remote ?? localRemote;
    const shortBranch = picked.startsWith(`${r}/`) ? picked.slice(r.length + 1) : picked;
    invoke("db_set_repo_default_branch", { repoId: repo.id, branch: shortBranch }).catch((e) =>
      setPickerError(String(e)),
    );
  };
  const saveRemote = (r: string) => {
    setLocalRemote(r);
    invoke("db_set_repo_remote", { repoId: repo.id, remote: r }).catch((e) => setPickerError(String(e)));
  };
  return (
    <>
      <div className="settings-rows">
        <Row label="Branch new workspaces from" help="Each workspace is an isolated copy of your codebase." stacked>
          <Picker label="Base branch" value={localBranch} options={remoteBranchNames} onChange={saveBranch} />
        </Row>
        <Row label="Remote origin" help="Where should we push, pull, and create PRs?" stacked>
          <Picker label="Remote origin" value={localRemote} options={remoteNames} onChange={saveRemote} />
        </Row>
        <Row
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              Delete branch on archive
              {repo.path && git?.delete_branch_on_archive.layer === "repo_local" && (
                <Menu.Root>
                  <Menu.Trigger
                    type="button"
                    className="btn btn-ghost"
                    aria-label="Setting actions"
                    style={{ width: 24, height: 24, padding: 0, color: "var(--s-muted)" }}
                  >
                    <EllipsisIcon />
                  </Menu.Trigger>
                  <Menu.Portal>
                    <Menu.Positioner className="sb-actions-positioner" side="bottom" align="end" sideOffset={4}>
                      <Menu.Popup className="sb-actions-popup" aria-label="Delete branch on archive actions">
                        <Menu.Item className="sb-actions-item" onClick={() => set("git.delete_branch_on_archive", null)}>
                          Reset
                        </Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.Root>
              )}
            </span>
          }
          help={
            <>
              <p>Delete the local branch when archiving a workspace.</p>
              <p>
                To delete the remote branch,{" "}
                <a href={GITHUB_AUTO_DELETE_DOCS} target="_blank" rel="noopener noreferrer">
                  configure it on GitHub
                </a>
                .
              </p>
            </>
          }
          control={flag("Delete branch on archive", "git.delete_branch_on_archive", git?.delete_branch_on_archive.value, false)}
        >
          {git?.delete_branch_on_archive.value && <div className="settings-row-danger">Warning: archived workspaces will be unrecoverable</div>}
        </Row>
        <Row label="Archive on merge" help="Automatically archive a workspace after merging its PR in OpenConductor">
          {flag("Archive on merge", "git.archive_on_merge", git?.archive_on_merge.value, false)}
        </Row>
        <Row
          label="Set upstream on plain git push"
          help={
            <>
              Configure new OpenConductor workspaces so plain <code>git push</code> sets a branch upstream. Turning this off avoids writing Git worktree config, but PR info may be
              less reliable until branches have an upstream.
            </>
          }
        >
          {flag("Set upstream on plain git push", "git.worktree_push_auto_setup_remote", git?.worktree_push_auto_setup_remote.value, true)}
        </Row>
      </div>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {pickerError && (
        <p className="error small" role="alert">
          {pickerError}
        </p>
      )}
    </>
  );
}

/**
 * Conductor's branch and remote pickers (`EJe`, `Tga`: a bordered trigger with
 * an up-down chevron). The select inside fills the trigger invisibly so the
 * native picker opens on click; the chevron is decorative.
 */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <span className="settings-picker">
      <select
        aria-label={label}
        className="settings-picker-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {/* Keep the current value available even if the branch list hasn't loaded yet */}
        {!options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
      </svg>
    </span>
  );
}

/** Fetches the repo's local and remote-tracking branches for base-branch and remote pickers. */
function useRepoBranches(repoId: string): Array<{ name: string; remote: string | null }> {
  const [branches, setBranches] = useState<Array<{ name: string; remote: string | null }>>([]);
  useEffect(() => {
    if (!repoId) return;
    invoke<Array<{ name: string; remote: string | null }>>("list_branches", { repoId })
      .then((bs) => setBranches(bs.map(({ name, remote }) => ({ name, remote }))))
      .catch(() => {});
  }, [repoId]);
  return branches;
}
