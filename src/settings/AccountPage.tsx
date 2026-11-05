import { useEffect, useState } from "react";
import { loadBranchPrefix } from "../workspace/api";
import { Row } from "./GeneralPage";
import { AccountAgentRows } from "./rows/AccountAgentRows";
import type { Settings } from "./types";

/**
 * Settings › Personal › Account (`/settings/user/account`). Conductor's tab
 * holds its own account (billing, sign out), GitHub access and Linear, plus
 * Enterprise data privacy and the Claude Code / Codex tool-approval rows
 * (evidence/settings/settings-registry.json, tab `account`). OpenConductor
 * has no Conductor account: GitHub access is the GitHub CLI's login, shown
 * here read-only, followed by the tool-approval rows.
 */
export function AccountPage({ settings, save }: { settings: Settings; save: (next: Settings) => void }) {
  const [login, setLogin] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    loadBranchPrefix().then((info) => setLogin(info.githubUsername), () => setLogin(null));
  }, []);
  return (
    <div className="settings-rows">
      <Row label="GitHub" help="OpenConductor uses the GitHub CLI's login for pull requests and cloning. Sign in with gh auth login.">
        <span className="muted" aria-label="GitHub account">
          {login === undefined ? "Checking…" : login ? `Signed in as ${login}` : "Not signed in"}
        </span>
      </Row>
      <AccountAgentRows settings={settings} save={save} />
    </div>
  );
}
