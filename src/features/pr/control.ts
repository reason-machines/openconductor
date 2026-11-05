// What the workspace header's PR control renders for a header state.
// The precedence of states comes from `pr_header_state` (Rust); this file
// only turns the chosen action into our own label and the control's intent.
import type { HeaderState, MergeMethod, PrInfo } from "./types.ts";

export type Intent =
  /** Ask the workspace's agent to open a PR (menu offers a draft). */
  | "create"
  /** Merge now with the repository's preferred method. */
  | "merge"
  /** Take the draft PR out of draft. */
  | "ready"
  /** Approve the PR at the head commit shown. */
  | "approve"
  /** Checks are pending: let GitHub merge once they pass (gh pr merge --auto), or stop that. */
  | "enable_automerge"
  | "disable_automerge"
  /** Plain status; clicking opens the PR on GitHub when there is one. */
  | "status";

export interface Control {
  intent: Intent;
  label: string;
  /** Tooltip with the longer explanation. */
  title: string;
  tone: HeaderState["tone"];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Merge tooltip naming the method; a merge commit needs no extra words (as in the reference). */
export function mergeMethodText(method: MergeMethod | null): string | null {
  if (method === "squash") return "Squash and merge";
  if (method === "rebase") return "Rebase and merge";
  return null;
}

export interface ControlOptions {
  /** The repository's merge method, once known (Merge tooltip). */
  method?: MergeMethod | null;
  /** The "Automerge" setting. */
  automerge?: boolean;
}

export function prControl(state: HeaderState | null, pr: PrInfo | null, opts: ControlOptions = {}): Control | null {
  if (!state) return null;
  const tone = state.tone;
  const num = pr ? `#${pr.number}` : "";
  const status = (label: string, title = label): Control => ({ intent: "status", label, title, tone });
  const a = state.action;
  switch (a.type) {
    case "create_pr":
      return { intent: "create", label: "Create PR", title: "Ask the agent to commit, push and open a pull request", tone };
    case "working":
      return status("Agent working…", "The agent is still working on this branch");
    case "loading_pr":
      return status("Loading PR…");
    case "commit_and_push":
      return status("Uncommitted changes", "Commit and push the workspace's changes to update the PR");
    case "incompatible":
      return status("Branch diverged", "The local branch and its remote branch have different histories");
    case "pull":
      return status(`Pull ${a.behind}`, `Remote branch has ${plural(a.behind, "commit")} this workspace does not`);
    case "push":
      return status(`Push ${a.ahead}`, `This workspace has ${plural(a.ahead, "commit")} not pushed yet`);
    case "merge_conflicts":
      return status("Merge conflicts", `PR ${num} conflicts with its base branch`);
    case "changes_requested":
      return status("Changes requested", a.hasPendingComments ? "A reviewer requested changes; you have unsent review comments" : "A reviewer requested changes");
    case "draft_pr":
      return pr
        ? { intent: "ready", label: "Ready for review", title: `Take draft PR ${num} out of draft`, tone }
        : status("Draft PR", "The PR is a draft");
    case "checks_failing": {
      const label = a.total !== null ? `${a.failed}/${a.total} checks failed` : `${plural(a.failed, "check")} failed`;
      const pending = a.pending > 0 ? `, ${a.pending} still running` : "";
      return status(label, `${plural(a.failed, "check")} failed${pending}`);
    }
    case "checks_pending":
      // As in the reference: only with the setting on, a PR, and merge rights not ruled out.
      if (opts.automerge && pr && pr.viewerCanMerge !== false) {
        return pr.isAutoMergeEnabled
          ? { intent: "disable_automerge", label: "Cancel automerge", title: `PR ${num} merges once its checks pass; click to cancel`, tone }
          : { intent: "enable_automerge", label: "Automerge", title: `Merge PR ${num} automatically once its checks pass`, tone };
      }
      return status("Checks running", `${plural(a.pending, "check")} still running`);
    case "approve_pr":
      return pr
        ? { intent: "approve", label: "Approve PR", title: `Approve PR ${num} at its current head commit`, tone }
        : status("Review requested");
    case "review_required":
      return status("Review required", "The PR needs an approving review before it can merge");
    case "blocked":
      return status("Merge blocked", "Branch protection blocks merging this PR");
    case "ready_to_merge": {
      const optional = a.optionalFailed > 0 ? ` (${plural(a.optionalFailed, "optional check")} failed)` : "";
      const how = mergeMethodText(opts.method ?? null) ?? "Merge";
      return { intent: "merge", label: "Merge", title: `${how} PR ${num}${optional}`.trim(), tone };
    }
    case "unable_to_merge":
      return status("Can't merge", "You don't have permission to merge, or GitHub reports the PR as not mergeable");
    case "queued_to_merge":
      return status("In merge queue", `PR ${num} is in the merge queue (${a.state.toLowerCase().replace(/_/g, " ")})`);
    case "merged":
      return status(`Merged ${num}`.trim(), `PR ${num} is merged`);
  }
}
