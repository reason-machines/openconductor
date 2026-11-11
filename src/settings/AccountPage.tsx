import { useEffect, useState } from "react";
import { openUrl } from "../backend";
import { loadBranchPrefix } from "../workspace/api";
import { Toggle } from "./controls";
import { Row } from "./GeneralPage";
import { GitHubMarkIcon, LinkIcon, LogOutIcon } from "./icons";
import { readReasonStatus, signOutOfReason } from "../onboarding/reasonSignIn";
import type { ReasonAccount } from "./agents/reasonModes";
import { AccountAgentRows } from "./rows/AccountAgentRows";
import type { Settings } from "./types";

const GH_AUTH_DOCS = "https://cli.github.com/manual/gh_auth_login";

/**
 * Settings › Personal › Account (`/settings/user/account`), laid out as
 * Conductor 0.87.6's account tab (`account:identity-integrations`,
 * `enterprise_data_privacy`, the two tool-approval rows, `account:sign-out`;
 * renderApp-D_fmY7hW.js, evidence/settings/NOTES.md "Settings pages, row for
 * row"). OpenConductor has no Conductor account, so the identity is the
 * GitHub CLI's login: the header shows it, and the GitHub card says whether
 * `gh` is signed in. Conductor's Linear and Billing cards need its account
 * service and are not shown. "Sign out" signs out of the app's account,
 * Reason (`reason logout`), and like Conductor's shows only while signed in.
 * The tool-approval rows belong to rows/AccountAgentRows.tsx.
 */
export function AccountPage({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const [login, setLogin] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    loadBranchPrefix().then((info) => setLogin(info.githubUsername), () => setLogin(null));
  }, []);
  const privacy = settings.enterprise_data_privacy === true;
  return (
    <div className="settings-rows settings-account">
      <div className="settings-account-identity" data-settings-row>
        <div className="settings-avatar" aria-hidden>
          {(login ?? "?").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="settings-account-name">{login === undefined ? "Checking…" : (login ?? "Not signed in")}</div>
          <div className="settings-row-help">{login ? "Signed in with the GitHub CLI" : "Sign in with gh auth login"}</div>
        </div>
      </div>
      <div className="settings-account-cards" data-settings-row>
        <div className="settings-account-card">
          <div className="settings-account-card-icon">
            <GitHubMarkIcon size={18} />
          </div>
          <div className="settings-row-text">
            <div className="settings-account-card-title">GitHub</div>
            <div className="settings-row-help">
              {login ? `Connected as ${login}. Used to clone repos, create PRs, load comments and more.` : "Connect GitHub to clone repos, create PRs, load comments and more."}
            </div>
          </div>
          {login ? (
            <span className="settings-row-help" aria-label="GitHub account">
              Connected
            </span>
          ) : (
            <button type="button" className="btn settings-outline" aria-label="GitHub account" onClick={() => void openUrl(GH_AUTH_DOCS).catch(() => undefined)}>
              Connect
              <LinkIcon size={14} />
            </button>
          )}
        </div>
      </div>
      <Row
        label="Enterprise data privacy"
        help="Disable features requiring external AI providers, such as AI generated chat titles, as well as custom MCP servers."
      >
        <Toggle label="Enterprise data privacy" checked={privacy} onChange={(on) => save({ ...settings, enterprise_data_privacy: on })} />
      </Row>
      <AccountAgentRows settings={settings} save={save} />
      <ReasonSignOut />
    </div>
  );
}

/**
 * Conductor's `account:sign-out` row: right-aligned outline "Sign out" with a
 * log-out icon over a top border, "Signing out..." while it runs, nothing when
 * signed out. Here it signs this computer out of Reason.
 */
function ReasonSignOut() {
  const [account, setAccount] = useState<ReasonAccount | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void readReasonStatus().then((s) => live && setAccount(s.account));
    return () => {
      live = false;
    };
  }, []);
  if (!account) return null;
  const signOut = () => {
    setPending(true);
    setError(null);
    signOutOfReason().then(
      () => setAccount(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    ).finally(() => setPending(false));
  };
  return (
    <div className="settings-account-signout" data-settings-row>
      {error && <span className="settings-row-help settings-account-signout-error">{error}</span>}
      <button type="button" className="btn settings-outline" onClick={signOut} disabled={pending}>
        <LogOutIcon size={16} />
        {pending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
