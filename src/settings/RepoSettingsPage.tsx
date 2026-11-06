import { useEffect, useState } from "react";
import { openUrl } from "../backend";
import type { Repo } from "../state/types";
import { setSpotlightTesting, spotlightTesting } from "../spotlight/testingApi";
import { SPOTLIGHT_DOCS_URL, SPOTLIGHT_SETTING_DESCRIPTION, SPOTLIGHT_SETTING_TITLE, toggleBlocked, type SpotlightTesting } from "../spotlight/testing";
import { Row } from "./GeneralPage";
import { errorText } from "./api";
import type { RepoSection } from "./routes";
import { RepoActionsRows } from "./rows/PromptRows";
import { RepoGitRows } from "./rows/RepoGitRows";
import { RepoEnvironmentPage } from "./RepoEnvironmentPage";
import { RepoMiscRows, type RepoMiscActions } from "./rows/RepoMiscRows";
import { RepoScriptsRows } from "./rows/RepoScriptsRows";

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
  return <RepoScriptsRows repo={repo} />;
}

/**
 * Conductor's Actions tab (registry `Q3a`): "Use spotlight testing" with its
 * "Learn how" link, then the six prompt rows, all in one row list.
 */
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
        <Row
          label={SPOTLIGHT_SETTING_TITLE}
          help={
            blocked && blocked !== "Loading" ? (
              blocked
            ) : (
              <>
                {SPOTLIGHT_SETTING_DESCRIPTION}{" "}
                <button type="button" className="oc-learn-how" onClick={() => void openUrl(SPOTLIGHT_DOCS_URL)}>
                  Learn how
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M7 7h10v10M7 17 17 7" />
                  </svg>
                </button>
              </>
            )
          }
        >
          <input
            type="checkbox"
            role="switch"
            aria-label={SPOTLIGHT_SETTING_TITLE}
            checked={setting?.enabled ?? false}
            disabled={blocked !== null}
            onChange={(e) => change(e.target.checked)}
          />
        </Row>
        {repo.path && <RepoActionsRows repoPath={repo.path} />}
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </>
  );
}

function RepoMisc({ repo, actions }: { repo: Repo; actions: RepoMiscActions }) {
  return <RepoMiscRows repo={repo} actions={actions} />;
}
