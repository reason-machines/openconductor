// parity:pr.edit:logic
// Rules for editing a PR's title and description, after Conductor's
// updatePrMetadata (evidence/pr/NOTES.md, "PR title and description"): the
// title is trimmed and may not be empty; nothing is sent when nothing changed.

export interface PrText {
  title: string;
  body: string;
}

export type PrEditPlan =
  | { kind: "noop" }
  | { kind: "invalid"; message: string }
  | { kind: "update"; title?: string; body?: string };

/** What to send to `pr_edit` for `edit`, given the PR's current title and body. */
export function planPrEdit(current: PrText, edit: Partial<PrText>): PrEditPlan {
  let title: string | undefined;
  if (edit.title !== undefined) {
    const trimmed = edit.title.trim();
    if (!trimmed) return { kind: "invalid", message: "PR title cannot be empty" };
    if (trimmed !== current.title) title = trimmed;
  }
  const body = edit.body !== undefined && edit.body !== current.body ? edit.body : undefined;
  if (title === undefined && body === undefined) return { kind: "noop" };
  return { kind: "update", ...(title !== undefined && { title }), ...(body !== undefined && { body }) };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The error shown when GitHub refuses the edit. */
export function prEditErrorMessage(err: unknown): string {
  const message = messageOf(err);
  if (message.toLowerCase().includes("read:org")) {
    return "Failed to update PR on GitHub: your GitHub token is missing the read:org scope. Run gh auth refresh -s read:org, then try again.";
  }
  return `Failed to update PR on GitHub: ${message}`;
}

export type RetargetPlan = { kind: "skip" } | { kind: "retarget"; number: number; base: string };

/** Conductor retargets only an open, unmerged PR whose base differs from the new target. */
export function planRetarget(pr: { number: number; baseRefName: string; isMerged: boolean } | null, base: string): RetargetPlan {
  const target = base.trim();
  if (!pr || pr.isMerged || !target || pr.baseRefName === target) return { kind: "skip" };
  return { kind: "retarget", number: pr.number, base: target };
}

export function retargetErrorMessage(err: unknown): string {
  return `Failed to change the PR's base branch: ${messageOf(err)}`;
}
