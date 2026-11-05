import { useEffect, useState } from "react";
import { loadBranchPrefix } from "../workspace/api";
import { PrefSwitchRow, Select, Toggle } from "./controls";
import { Row } from "./GeneralPage";
import { enumPref, withEnumPref } from "./prefs";
import { blankToNull, branchPrefixError, branchPreview, normalizeCustomPrefix, withField } from "./model";
import type { BranchPrefixType, Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Personal › Git, row for row with Conductor 0.87.6's user-scope
 * `git` tab (renderApp-D_fmY7hW.js registry, evidence/settings/NOTES.md
 * "Settings pages, row for row"). "Git identity" shows only for a cloud
 * organization and "Branch new workspaces from" / "Remote origin" only in a
 * repository's Git section, so a local user's page starts at "Open pull
 * requests in".
 */
export function GitPage({ settings, save }: Props) {
  const git = settings.git;
  const [githubUser, setGithubUser] = useState<string | null>(null);
  // The backend refuses `custom` without a prefix, so choosing Custom stays
  // local (input shown, nothing saved) until a valid prefix is entered.
  const [type, setLocalType] = useState<BranchPrefixType>(git.branch_prefix_type);
  const [custom, setCustom] = useState(git.branch_prefix ?? "");
  const customError = type === "custom" ? branchPrefixError(normalizeCustomPrefix(custom)) : null;

  useEffect(() => {
    loadBranchPrefix().then((info) => setGithubUser(info.githubUsername), () => setGithubUser(null));
  }, []);
  useEffect(() => setLocalType(git.branch_prefix_type), [git.branch_prefix_type]);
  useEffect(() => setCustom(git.branch_prefix ?? ""), [git.branch_prefix]);

  const withCustom = (value: string): Settings => ({
    ...settings,
    git: { ...git, branch_prefix_type: "custom", branch_prefix: blankToNull(value) },
  });

  const choose = (next: BranchPrefixType) => {
    setLocalType(next);
    if (next !== "custom") save(withField(settings, "git", "branch_prefix_type", next));
    else if (branchPrefixError(normalizeCustomPrefix(custom)) === null) save(withCustom(normalizeCustomPrefix(custom)));
  };

  const commitCustom = () => {
    const value = normalizeCustomPrefix(custom);
    if (branchPrefixError(value) !== null) return;
    if (git.branch_prefix_type === "custom" && value === (git.branch_prefix ?? "")) return;
    save(withCustom(value));
  };

  const option = (value: BranchPrefixType, label: string) => (
    <label className="settings-radio">
      <input type="radio" name="branch-prefix" value={value} checked={type === value} onChange={() => choose(value)} />
      {label}
    </label>
  );

  return (
    <div className="settings-rows">
      <Row label="Open pull requests in" stacked>
        <Select
          label="Open pull requests in"
          width={180}
          value={enumPref(settings, "pull_request_open_target")}
          options={[
            { value: "github", label: "GitHub" },
            { value: "linear", label: "Linear" },
            { value: "graphite", label: "Graphite" },
          ]}
          onChange={(v) => save(withEnumPref(settings, "pull_request_open_target", v))}
        />
      </Row>
      <Row label="Branch name prefix" help="Prefix for new workspace branch names." stacked>
        <div className="settings-radios" role="radiogroup" aria-label="Branch name prefix">
          {option("github_username", githubUser ? `GitHub username (${githubUser})` : "GitHub username")}
          {option("custom", "Custom")}
          {type === "custom" && (
            <div className="settings-radio-detail">
              <input
                type="text"
                className="settings-field"
                aria-label="Custom branch prefix"
                aria-invalid={customError !== null}
                placeholder="e.g. feature/ or myname-"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => e.key === "Enter" && commitCustom()}
              />
              {customError ? (
                <p className="error small">{customError}</p>
              ) : (
                <p className="settings-row-detail">Preview: {branchPreview(withCustom(normalizeCustomPrefix(custom)), githubUser)}</p>
              )}
            </div>
          )}
          {option("none", "None")}
        </div>
      </Row>
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="auto_rename_workspace_on_branch_name_set"
        label="Rename workspace when branch is named"
        help="Automatically rename workspaces from their placeholder city name to the branch name generated from the first message."
      />
      <Row
        label="Delete branch on archive"
        help={
          <>
            <p>Delete the local branch when archiving a workspace.</p>
            <p>
              To delete the remote branch,{" "}
              <a
                href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-the-automatic-deletion-of-branches"
                target="_blank"
                rel="noopener noreferrer"
              >
                configure it on GitHub
              </a>
              .
            </p>
          </>
        }
        control={
          <Toggle
            label="Delete branch on archive"
            checked={git.delete_branch_on_archive}
            onChange={(on) => save(withField(settings, "git", "delete_branch_on_archive", on))}
          />
        }
      >
        {git.delete_branch_on_archive && <div className="settings-row-danger">Warning: archived workspaces will be unrecoverable</div>}
      </Row>
      <Row label="Archive on merge" help="Automatically archive a workspace after merging its PR in OpenConductor">
        <Toggle label="Archive on merge" checked={git.archive_on_merge} onChange={(on) => save(withField(settings, "git", "archive_on_merge", on))} />
      </Row>
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="automerge_enabled"
        label="Automerge"
        help="Show an automerge button in the git panel when checks are pending. Requires automerge to be enabled in your GitHub repository settings. Automerge is not supported for stacked pull requests."
      />
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="treat_optional_checks_as_blocking"
        label="Treat optional checks as blocking"
        help="Hide the merge button when any check has failed, including checks GitHub considers optional."
      />
      <Row
        label="Set upstream on plain git push"
        help={
          <>
            Configure new OpenConductor workspaces so plain <code>git push</code> sets a branch upstream. Turning this off avoids writing Git worktree config, but PR info may be less reliable until branches have an upstream.
          </>
        }
      >
        <Toggle
          label="Set upstream on plain git push"
          checked={git.worktree_push_auto_setup_remote}
          onChange={(on) => save(withField(settings, "git", "worktree_push_auto_setup_remote", on))}
        />
      </Row>
      <PrefSwitchRow
        settings={settings}
        save={save}
        pref="github_stacked_prs_enabled"
        label="Use GitHub stacked PRs"
        help={
          <>
            Instruct agents that they can use <code>gh stack</code> for PR stacking.
          </>
        }
      />
    </div>
  );
}
