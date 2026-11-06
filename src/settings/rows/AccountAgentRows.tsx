import { Row } from "../GeneralPage";
import { CODEX_TOOL_APPROVALS, withAgentModel } from "../agentSettings";
import type { CodexToolApprovalPolicy, Settings } from "../types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Account › "Claude Code tool approvals" (`tool_approvals_enabled`) and
 * "Codex tool approvals" (`models.codex.tool_approval_policy`), with
 * Conductor's copy (evidence/settings/NOTES.md, "Models and providers").
 * With Claude approvals on, Claude Code chats ask before tools and the Big
 * terminal's Claude preset runs plain `claude`; off, they run with
 * `bypassPermissions` / `--dangerously-skip-permissions`. "Always approve"
 * answers every Codex approval request. Conductor also shows "Changes take
 * effect the next time Conductor starts" because its sidecar reads the
 * setting at start; ours applies to the next session and the next big
 * terminal, so there is no restart prompt.
 */
export function AccountAgentRows({ settings, save }: Props) {
  const policy = settings.models.codex.tool_approval_policy ?? "default";
  return (
    <>
      <Row label="Claude Code tool approvals" help="Require manual approval before agents can run tools.">
        <input
          type="checkbox"
          role="switch"
          aria-label="Claude Code tool approvals"
          checked={settings.tool_approvals_enabled === true}
          onChange={(e) => save({ ...settings, tool_approvals_enabled: e.target.checked })}
        />
      </Row>
      <Row label="Codex tool approvals">
        <select
          aria-label="Codex tool approvals"
          value={policy}
          onChange={(e) => save(withAgentModel(settings, "codex", "tool_approval_policy", e.target.value as CodexToolApprovalPolicy))}
        >
          {CODEX_TOOL_APPROVALS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}
