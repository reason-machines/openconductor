// Repository Settings › Git rows for `[git]` flags Conductor lets a
// repository override (scopes user + workspace). Only "Set upstream on plain
// git push" is shown: archive does not read Delete branch on archive or
// Archive on merge yet (evidence/settings/NOTES.md).
import { useState } from "react";
import { layerLabel, repoSettingsSetLocal } from "../repoSettings.ts";
import { notifyRepoSettingsChanged, useRepoSettings } from "../useRepoSettings.ts";
import { Row } from "../GeneralPage";

const TITLE = "Set upstream on plain git push";
const HELP =
  "Configure new workspaces so plain git push sets a branch upstream. Turning this off avoids writing Git worktree config, but PR info may be less reliable until branches have an upstream.";

/** Mount on the repository Git page (`/settings/repos/$repoId/git`). */
export function RepoGitRows({ repoPath }: { repoPath: string }) {
  const effective = useRepoSettings(repoPath);
  const [error, setError] = useState<string | null>(null);
  const flag = effective?.git.worktree_push_auto_setup_remote;
  const change = (on: boolean) => {
    setError(null);
    repoSettingsSetLocal(repoPath, "git.worktree_push_auto_setup_remote", on).then(notifyRepoSettingsChanged, () => setError("Failed to save the setting"));
  };
  const source = flag && flag.layer !== "repo_local" ? ` Currently from ${layerLabel(flag.layer)}.` : "";
  return (
    <>
      <div className="settings-rows">
        <Row label={TITLE} help={HELP + source}>
          <input
            type="checkbox"
            role="switch"
            aria-label={TITLE}
            checked={flag?.value ?? true}
            disabled={!flag}
            onChange={(e) => change(e.target.checked)}
          />
        </Row>
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}
