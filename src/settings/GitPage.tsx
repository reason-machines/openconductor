import { useEffect, useState } from "react";
import { loadBranchPrefix } from "../workspace/api";
import { Row } from "./GeneralPage";
import { blankToNull, branchPrefixError, branchPreview, normalizeCustomPrefix, withField } from "./model";
import type { BranchPrefixType, Settings } from "./types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Settings › Git. Conductor's user-scope Git tab has more rows (Open pull
 * requests in, Delete branch on archive, Archive on merge, Automerge, ...);
 * only rows whose setting something here reads are shown
 * (evidence/settings/NOTES.md, "Settings pages"). `delete_branch_on_archive`
 * and `archive_on_merge` are stored but get rows once archiving is a command.
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
      <Row label="Branch name prefix" help="Prefix for new workspace branch names.">
        <div className="settings-radios" role="radiogroup" aria-label="Branch name prefix">
          {option("github_username", githubUser ? `GitHub username (${githubUser})` : "GitHub username")}
          {option("custom", "Custom")}
          {type === "custom" && (
            <div className="settings-radio-detail">
              <input
                type="text"
                aria-label="Custom branch prefix"
                aria-invalid={customError !== null}
                placeholder="e.g. feature/ or myname"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={commitCustom}
                onKeyDown={(e) => e.key === "Enter" && commitCustom()}
              />
              {customError ? (
                <p className="error small">{customError}</p>
              ) : (
                <p className="muted small">Preview: {branchPreview(withCustom(normalizeCustomPrefix(custom)), githubUser)}</p>
              )}
            </div>
          )}
          {option("none", "None")}
        </div>
      </Row>
      <Row
        label="Set upstream on plain git push"
        help="Configure new workspaces so plain git push sets a branch upstream. Turning this off avoids writing Git worktree config, but PR info may be less reliable until branches have an upstream."
      >
        <input
          type="checkbox"
          role="switch"
          aria-label="Set upstream on plain git push"
          checked={git.worktree_push_auto_setup_remote}
          onChange={(e) => save(withField(settings, "git", "worktree_push_auto_setup_remote", e.target.checked))}
        />
      </Row>
    </div>
  );
}
