import { useEffect, useState } from "react";
import type { Repo } from "../state/types";
import { setSpotlightTesting, spotlightTesting } from "../spotlight/testingApi";
import { SPOTLIGHT_SETTING_DESCRIPTION, SPOTLIGHT_SETTING_TITLE, toggleBlocked, type SpotlightTesting } from "../spotlight/testing";
import { Row } from "./GeneralPage";
import { errorText } from "./api";
import { WORKSPACES_PATH_DESCRIPTION, WORKSPACES_PATH_TITLE, repoWorkspacesPath } from "./rootPath";
import type { RepoSection } from "./routes";
import { RepoActionsRows } from "./rows/PromptRows";
import { RepoEnvironmentRows } from "./rows/EnvironmentRows";
import { RepoGitRows } from "./rows/RepoGitRows";
import { RepoScriptsRows } from "./rows/RepoScriptsRows";

interface Props {
  repo: Repo;
  section: RepoSection;
}

/**
 * A repository's settings (`/settings/repos/$repoId/<section>`, Conductor's
 * "workspace" scope). Conductor writes this scope to the repository's
 * `.conductor/settings.local.toml`; the rows per section follow its registry
 * (evidence/settings/settings-registry.json, tabs environment, git, scripts,
 * actions, misc). Rows whose setting OpenConductor does not read yet are not
 * shown; see evidence/settings/NOTES.md, "Settings routes".
 */
export function RepoSettingsPage({ repo, section }: Props) {
  // Conductor's `uti`: the repository scope edits the main checkout's
  // `.conductor/settings.local.toml`; like Conductor, the page does not print the path.
  return (
    <div className="settings-section">
      {section === "environment" && <RepoEnvironment repo={repo} />}
      {section === "git" && <RepoGit repo={repo} />}
      {section === "scripts" && <RepoScripts repo={repo} />}
      {section === "actions" && <RepoActions repo={repo} />}
      {section === "misc" && <RepoMisc repo={repo} />}
    </div>
  );
}

function RepoEnvironment({ repo }: { repo: Repo }) {
  if (!repo.path) return <p className="muted small">This repository has no local checkout, so its environment settings cannot be edited.</p>;
  return <RepoEnvironmentRows repoPath={repo.path} />;
}

function RepoGit({ repo }: { repo: Repo }) {
  return <RepoGitRows repo={repo} />;
}

function RepoScripts({ repo }: { repo: Repo }) {
  return <RepoScriptsRows repo={repo} />;
}

function RepoActions({ repo }: { repo: Repo }) {
  const [setting, setSetting] = useState<SpotlightTesting | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setSetting(null);
    spotlightTesting(repo.id).then(setSetting, (e) => setError(errorText(e)));
  }, [repo.id]);
  const blocked = toggleBlocked(setting, Boolean(repo.path));
  const change = (enabled: boolean) => {
    setError(null);
    setSpotlightTesting(repo.id, repo.path, enabled).then((c) => setSetting(c.setting), (e) => setError(errorText(e)));
  };
  return (
    <>
      <div className="settings-rows">
        <Row label={SPOTLIGHT_SETTING_TITLE} help={blocked && blocked !== "Loading" ? blocked : SPOTLIGHT_SETTING_DESCRIPTION}>
          <input
            type="checkbox"
            role="switch"
            aria-label={SPOTLIGHT_SETTING_TITLE}
            checked={setting?.enabled ?? false}
            disabled={blocked !== null}
            onChange={(e) => change(e.target.checked)}
          />
        </Row>
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
      {repo.path && <RepoActionsRows repoPath={repo.path} />}
    </>
  );
}

function RepoMisc({ repo }: { repo: Repo }) {
  // Conductor's `misc:workspaces-path`: the repository's `workspacesStoragePath`, read-only.
  const [workspaces, setWorkspaces] = useState<string | null>(null);
  useEffect(() => {
    setWorkspaces(null);
    repoWorkspacesPath(repo.id, repo.name).then(setWorkspaces, () => setWorkspaces(null));
  }, [repo.id, repo.name]);
  return (
    <div className="settings-rows">
      <Row label="Root path" help="Do not move or delete this directory. Instead, remove the repository in OpenConductor.">
        <code aria-label="Root path">{repo.path || "No local checkout"}</code>
      </Row>
      <Row label={WORKSPACES_PATH_TITLE} help={WORKSPACES_PATH_DESCRIPTION}>
        {workspaces && (
          <code className="settings-path-value" aria-label={WORKSPACES_PATH_TITLE} title={workspaces}>
            {workspaces}
          </code>
        )}
      </Row>
    </div>
  );
}
