import { useEffect, useState } from "react";
import type { Repo } from "../state/types";
import { scriptsConfig } from "../scripts/api";
import type { ScriptsConfig } from "../scripts/model";
import { setSpotlightTesting, spotlightTesting } from "../spotlight/testingApi";
import { SPOTLIGHT_SETTING_DESCRIPTION, SPOTLIGHT_SETTING_TITLE, toggleBlocked, type SpotlightTesting } from "../spotlight/testing";
import { Row } from "./GeneralPage";
import { errorText } from "./api";
import { WORKSPACES_PATH_DESCRIPTION, WORKSPACES_PATH_TITLE, repoWorkspacesPath } from "./rootPath";
import type { RepoSection } from "./routes";

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
  // Conductor's `uti`: the repository scope edits the main checkout's local settings file.
  const file = repo.path ? `${repo.path.replace(/\/+$/, "")}/.conductor/settings.local.toml` : null;
  return (
    <div className="settings-section">
      {section === "environment" && <RepoEnvironment />}
      {section === "git" && <RepoGit repo={repo} />}
      {section === "scripts" && <RepoScripts repo={repo} />}
      {section === "actions" && <RepoActions repo={repo} />}
      {section === "misc" && <RepoMisc repo={repo} />}
      {file && <p className="muted small">Settings file: {file}</p>}
    </div>
  );
}

function RepoEnvironment() {
  return (
    <div className="settings-rows">
      <Row label="Environment settings" help="Environment variables, files, and preview URLs for this repository. Not editable here yet." >
        <span />
      </Row>
    </div>
  );
}

function RepoGit({ repo }: { repo: Repo }) {
  return (
    <div className="settings-rows">
      <Row label="Branch new workspaces from" help="Each workspace is an isolated copy of your codebase.">
        <code aria-label="Base branch">{repo.defaultBranch || "main"}</code>
      </Row>
      <Row label="Remote origin" help="Where should we push, pull, and create PRs?">
        <code aria-label="Remote origin">{repo.remote || "origin"}</code>
      </Row>
    </div>
  );
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
