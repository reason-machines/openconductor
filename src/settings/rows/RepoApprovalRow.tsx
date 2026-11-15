// Repository Settings › Git, "Claude Code tool approvals": this repository's
// own approval level for Claude Code chats, or the account's (approvalLevel.ts).
// Not a Conductor row. It is saved in the app's database, not in the
// repository's `.conductor/settings.local.toml`: a file that can come with a
// clone must not be able to turn approvals off.
import { useEffect, useState } from "react";
import type { Repo } from "../../state/types";
import { APPROVAL_LEVELS, approvalLabel, repoApprovalLevel, setRepoApprovalLevel, type ApprovalLevel } from "../approvalLevel";
import { Select, type Option } from "../controls";
import { Row } from "../GeneralPage";
import { useAccountApprovalLevel } from "../useApprovalLevel";

const FOLLOW_ACCOUNT = "account";

export function RepoApprovalRow({ repo }: { repo: Repo }) {
  const account = useAccountApprovalLevel();
  // undefined until read; null while the repository follows the account.
  const [own, setOwn] = useState<ApprovalLevel | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setOwn(undefined);
    setError(null);
    repoApprovalLevel(repo.id).then(
      (level) => live && setOwn(level),
      () => live && setError("Failed to read the setting"),
    );
    return () => {
      live = false;
    };
  }, [repo.id]);
  const options: Option<string>[] = [
    { value: FOLLOW_ACCOUNT, label: account ? `Account setting (${approvalLabel(account)})` : "Account setting" },
    ...APPROVAL_LEVELS.map((l) => ({ value: l.value as string, label: l.label })),
  ];
  const change = (value: string) => {
    setError(null);
    setRepoApprovalLevel(repo.id, value === FOLLOW_ACCOUNT ? null : (value as ApprovalLevel)).then(setOwn, () => setError("Failed to save the setting"));
  };
  return (
    <Row
      label="Claude Code tool approvals"
      help={
        <>
          How much Claude Code chats in this repository do before asking. {own ? APPROVAL_LEVELS.find((l) => l.value === own)?.help : "Follows Settings › Account unless set here."} A chat can pick
          its own level in its message box.
          {error && (
            <span className="error small" role="alert">
              {" "}
              {error}
            </span>
          )}
        </>
      }
    >
      <Select label="Claude Code tool approvals" value={own ?? FOLLOW_ACCOUNT} options={options} width={230} disabled={own === undefined} onChange={change} />
    </Row>
  );
}
