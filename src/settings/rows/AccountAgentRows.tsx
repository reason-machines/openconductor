import { Row } from "../GeneralPage";
import { CODEX_TOOL_APPROVALS, withAgentModel } from "../agentSettings";
import { APPROVAL_LEVELS, approvalLevel, withApprovalLevel, type ApprovalLevel } from "../approvalLevel";
import type { CodexToolApprovalPolicy, Settings } from "../types";

interface Props {
  settings: Settings;
  save: (next: Settings) => void;
}

/**
 * Account › "Claude Code tool approvals" and "Codex tool approvals"
 * (`models.codex.tool_approval_policy`, Conductor's copy:
 * evidence/settings/NOTES.md, "Models and providers").
 *
 * Conductor's Claude row is a switch (`tool_approvals_enabled`). Ours picks
 * one of three levels (approvalLevel.ts): "Auto" is the switch off (chats
 * run with `bypassPermissions`, the Big terminal's Claude preset with
 * `--dangerously-skip-permissions`), "Approve everything" is the switch on,
 * and "Approve PRs" in between lets edits and commands run and holds a push
 * or a pull request change for the user. A repository and a chat can each
 * pick their own level. "Always approve" answers every Codex approval
 * request. Conductor also shows "Changes take effect the next time Conductor
 * starts" because its sidecar reads the setting at start; ours applies to a
 * chat's next turn and the next big terminal, so there is no restart prompt.
 */
export function AccountAgentRows({ settings, save }: Props) {
  const policy = settings.models.codex.tool_approval_policy ?? "default";
  const level = approvalLevel(settings);
  return (
    <>
      <Row label="Claude Code tool approvals" help={APPROVAL_LEVELS.find((l) => l.value === level)?.help}>
        <ApprovalLevelPicker label="Claude Code tool approvals" value={level} onChange={(next) => save(withApprovalLevel(settings, next))} />
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

/** The three levels as one segmented control: a radio group, arrow keys move the choice. */
export function ApprovalLevelPicker({ label, value, onChange }: { label: string; value: ApprovalLevel; onChange: (level: ApprovalLevel) => void }) {
  const move = (delta: number) => {
    const at = APPROVAL_LEVELS.findIndex((l) => l.value === value);
    const next = APPROVAL_LEVELS[(at + delta + APPROVAL_LEVELS.length) % APPROVAL_LEVELS.length];
    onChange(next.value);
  };
  return (
    <div className="settings-segments" role="radiogroup" aria-label={label}>
      {APPROVAL_LEVELS.map((l) => (
        <button
          key={l.value}
          type="button"
          role="radio"
          aria-checked={l.value === value}
          tabIndex={l.value === value ? 0 : -1}
          title={l.help}
          onClick={() => l.value !== value && onChange(l.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              move(1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              move(-1);
            }
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
