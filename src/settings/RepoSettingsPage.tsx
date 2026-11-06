import { useEffect, useState } from "react";
import type { Repo } from "../state/types";
import { scriptsConfig } from "../scripts/api";
import type { ScriptsConfig } from "../scripts/model";
import { setSpotlightTesting, spotlightTesting } from "../spotlight/testingApi";
import { SPOTLIGHT_SETTING_DESCRIPTION, SPOTLIGHT_SETTING_TITLE, toggleBlocked, type SpotlightTesting } from "../spotlight/testing";
import { Row } from "./GeneralPage";
import { errorText } from "./api";
import type { RepoSection } from "./routes";
import { RepoActionsRows } from "./rows/PromptRows";
import { RepoGitRows } from "./rows/RepoGitRows";
import { RepoEnvironmentPage } from "./RepoEnvironmentPage";
import { RepoMiscRows, type RepoMiscActions } from "./rows/RepoMiscRows";

interface Props {
  repo: Repo;
  section: RepoSection;
  /** The Misc page's icon change and repository removal. */
  miscActions: RepoMiscActions;
}

/**
 * A repository's settings (`/settings/repos/$repoId/<section>`, Conductor's
 * "workspace" scope). Conductor writes this scope to the repository's
 * `.conductor/settings.local.toml`; the rows per section follow its registry
 * (evidence/settings/settings-registry.json, tabs environment, git, scripts,
 * actions, misc). Rows whose setting OpenConductor does not read yet are not
 * shown; see evidence/settings/NOTES.md, "Settings routes".
 */
export function RepoSettingsPage({ repo, section, miscActions }: Props) {
  // Conductor's `uti`: the repository scope edits the main checkout's
  // `.conductor/settings.local.toml`; like Conductor, the page does not print the path.
  return (
    <div className="settings-section">
      {section === "environment" && <RepoEnvironment repo={repo} />}
      {section === "git" && <RepoGit repo={repo} />}
      {section === "scripts" && <RepoScripts repo={repo} />}
      {section === "actions" && <RepoActions repo={repo} />}
      {section === "misc" && <RepoMisc repo={repo} actions={miscActions} />}
    </div>
  );
}

function RepoEnvironment({ repo }: { repo: Repo }) {
  return <RepoEnvironmentPage repo={repo} />;
}

function RepoGit({ repo }: { repo: Repo }) {
  return <RepoGitRows repo={repo} />;
}

function RepoScripts({ repo }: { repo: Repo }) {
  const [config, setConfig] = useState<ScriptsConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setConfig(null);
    setError(null);
    if (!repo.path) return;
    // Read the repository's own scripts: the "workspace" here is the main checkout.
    scriptsConfig({
      workspaceId: "",
      repositoryId: repo.id,
      repoRoot: repo.path,
      workspacePath: repo.path,
      workspaceName: repo.name,
      defaultBranch: repo.defaultBranch,
      targetBranch: null,
    }).then(setConfig, (e) => setError(errorText(e)));
  }, [repo.id, repo.path, repo.name, repo.defaultBranch]);

  if (!repo.path) return <p className="muted">This repository has no local checkout yet.</p>;
  if (error) return <p className="error small" role="alert">{error}</p>;
  if (!config) return <p className="muted">Loading…</p>;
  const script = (value: string | null | undefined) => (value ? <pre className="settings-script">{value}</pre> : <span className="muted">None</span>);
  return (
    <div className="settings-rows" aria-label="Repository scripts">
      <Row label="Setup script" help="Runs when a new workspace is created.">
        {script(config.setup)}
      </Row>
      <Row label="Run script" help={`Runs from the Run button. Mode: ${config.runMode}.`}>
        {config.run.length ? script(config.run.map((r) => r.command).join("\n")) : script(null)}
      </Row>
      <Row label="Archive script" help="Runs when a workspace is archived.">
        {script(config.archive)}
      </Row>
    </div>
  );
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

function RepoMisc({ repo, actions }: { repo: Repo; actions: RepoMiscActions }) {
  return <RepoMiscRows repo={repo} actions={actions} />;
}
