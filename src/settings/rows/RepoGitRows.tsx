// Repository Settings › Git, row for row with Conductor 0.87.6's workspace-scope
// git rows (renderApp-D_fmY7hW.js, registry `Dga`): "Branch new workspaces
// from" and "Remote origin" (stacked pickers), then the `[git]` flags a
// repository may override: Delete branch on archive, Archive on merge, Set
// upstream on plain git push. The flags are written to the repository's
// `.conductor/settings.local.toml`; archive reads them through the effective
// settings (workspace_archive_commands.rs, useArchiveOnMerge.ts).
import { useState, type ReactNode } from "react";
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
  const flag = (label: string, key: RepoLocalKey, value: boolean | undefined, fallback: boolean) => (
    <Toggle label={label} checked={value ?? fallback} disabled={!git} onChange={(on) => set(key, on)} />
  );
  return (
    <>
      <div className="settings-rows">
        <Row label="Branch new workspaces from" help="Each workspace is an isolated copy of your codebase." stacked>
          <Picker label="Base branch" value={`${remote}/${branch}`} />
        </Row>
        <Row label="Remote origin" help="Where should we push, pull, and create PRs?" stacked>
          <Picker label="Remote origin" value={remote} />
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
    </>
  );
}

/**
 * Conductor's branch and remote pickers (`EJe`, `Tga`: a bordered `text-sm px-2` trigger with an
 * up-down chevron). OpenConductor shows the current value in the same trigger; choosing another
 * branch or remote here is not wired yet (new workspaces read the base branch from git).
 */
function Picker({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="settings-picker" role="button" aria-label={label} aria-disabled="true" title="Changing this in OpenConductor is not supported yet">
      <span>{value}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
      </svg>
    </span>
  );
}
