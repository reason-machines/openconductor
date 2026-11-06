// parity:pr.review-actions:ui
// The PR tab of the main area (Conductor's PR view, renderApp @ ~9,652,003:
// the `sKo` header with the title, then Activity / Description / Checks). It
// opens from the "PR #N" chip in the workspace header. Ours shows the header
// (number, author, base branch picker, editable title and description) and
// the checks list; the Activity timeline is not built.
import { isTauri } from "@tauri-apps/api/core";
import type { ComponentProps } from "react";
import { ChecksTab } from "./checks/ChecksTab";
import { DEMO_PR, demoChecksEnabled } from "./checks/demo";
import { PrHeader } from "./edit/PrHeader";
import type { TargetBranch } from "./useTargetBranch";
import "./checks/checks.css";

type Props = ComponentProps<typeof ChecksTab> & {
  repoPath: string;
  defaultBranch: string;
  target: TargetBranch;
};

export function PrTab(props: Props) {
  const { pr, worktree, repoId, repoPath, defaultBranch, refresh, target } = props;
  const demo = !isTauri() && demoChecksEnabled();
  const shown = pr ?? (demo ? DEMO_PR : null);
  if (!shown) {
    return (
      <div className="pr-tab">
        <div className="placeholder small">
          <p>No pull request for this branch yet.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pr-tab" aria-label="Pull request tab">
      <PrHeader pr={shown} worktree={demo ? "demo" : worktree} repoId={repoId} repoPath={repoPath} defaultBranch={defaultBranch} refresh={refresh} target={target} />
      <ChecksTab {...props} />
    </div>
  );
}
